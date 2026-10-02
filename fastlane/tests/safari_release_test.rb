require_relative "../safari_release"

# No extra test gems: runs with the same Ruby/Bundler environment as Fastlane.
def assert(condition, message = "Assertion failed")
  raise message unless condition
end

def rejects(message)
  error = nil
  begin
    yield
  rescue StandardError => caught
    error = caught
  end
  assert(error && error.message.include?(message), "Expected rejection containing #{message.inspect}, got #{error.inspect}")
end

SIGNATURE = Base64.strict_encode64("s" * 64)
# Public Ed25519 test vector from RFC 8032, never a production signing key.
PRIVATE_KEY = Base64.strict_encode64(["9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60"].pack("H*"))
PUBLIC_KEY = Base64.strict_encode64(["d75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a"].pack("H*"))
DOWNLOAD_URL = "https://github.com/cu-3rd-party/lms-extension/releases/download/v2.6.6/lms-extension-safari.dmg"
APPCAST = <<~XML
  <?xml version="1.0" encoding="utf-8"?>
  <rss version="2.0" xmlns:sparkle="#{SafariRelease::SPARKLE_NAMESPACE}">
    <channel>
      <item>
        <sparkle:version>2.6.6</sparkle:version>
        <sparkle:shortVersionString>2.6.6</sparkle:shortVersionString>
        <enclosure url="#{DOWNLOAD_URL}" length="3" sparkle:edSignature="#{SIGNATURE}" type="application/octet-stream"/>
      </item>
    </channel>
  </rss>
XML

def validate(xml)
  SafariRelease.validate_appcast(xml, download_url: DOWNLOAD_URL, version: "2.6.6", size: 3)
end

def write_app_plist(release, public_key = PUBLIC_KEY)
  path = File.join(release, "CU-LMS-Enhancer.app", "Contents", "Info.plist")
  FileUtils.mkdir_p(File.dirname(path))
  File.write(path, <<~XML)
    <?xml version="1.0" encoding="UTF-8"?>
    <plist version="1.0"><dict><key>SUPublicEDKey</key><string>#{public_key}</string></dict></plist>
  XML
  path
end

tests = {
  "current and legacy Sparkle key formats" => -> {
    assert(Base64.strict_encode64(SafariRelease.signing_public_key(PRIVATE_KEY)) == PUBLIC_KEY)
    legacy = Base64.strict_encode64("s" * 64 + Base64.strict_decode64(PUBLIC_KEY))
    assert(Base64.strict_encode64(SafariRelease.signing_public_key(legacy)) == PUBLIC_KEY)
    rejects("required") { SafariRelease.signing_public_key(" ") }
    ["invalid!", "\"#{PRIVATE_KEY}\""].each do |key|
      rejects("unmodified text") { SafariRelease.signing_public_key(key) }
    end
    [Base64.strict_encode64(PRIVATE_KEY), Base64.strict_encode64("s" * 64)].each do |key|
      rejects("32 or 96 bytes") { SafariRelease.signing_public_key(key) }
    end
  },
  "signing secret matches the built app, including binary plists" => -> {
    Dir.mktmpdir("safari-key-test-") do |root|
      path = write_app_plist(root)
      options = { private_key: " #{PRIVATE_KEY}\n", plist_path: path }
      assert(SafariRelease.validate_signing_key(**options))
      _output, _errors, status = Open3.capture3("/usr/bin/plutil", "-convert", "binary1", path)
      assert(status.success?)
      assert(SafariRelease.validate_signing_key(**options))
      write_app_plist(root, Base64.strict_encode64("x" * 32))
      rejects("does not match SUPublicEDKey") { SafariRelease.validate_signing_key(**options) }
      write_app_plist(root)
      rejects("does not match SUPublicEDKey") { SafariRelease.validate_signing_key(**options.merge(private_key: PUBLIC_KEY)) }
      write_app_plist(root, "invalid!")
      rejects("base64-encoded 32-byte") { SafariRelease.validate_signing_key(**options) }
      write_app_plist(root, Base64.strict_encode64("short"))
      rejects("decode to 32 bytes") { SafariRelease.validate_signing_key(**options) }
      File.write(path, '<plist version="1.0"><dict/></plist>')
      rejects("missing or unreadable") { SafariRelease.validate_signing_key(**options) }
      rejects("not found") { SafariRelease.validate_signing_key(**options.merge(plist_path: File.join(root, "missing.plist"))) }
    end
  },
  "version from release tag" => -> {
    assert(SafariRelease.version("v2.6.6") == "2.6.6")
    assert(SafariRelease.version("2.6.6") == "2.6.6")
    ["", "v2.6.6-beta.1", "release-2.6.6", "2.06.6", "2.100.6", "2.6.6; touch file"].each do |value|
      rejects("Safari version") { SafariRelease.version(value) }
    end
  },
  "immutable release URL" => -> {
    assert(SafariRelease.download_prefix("cu-3rd-party/lms-extension", "v2.6.6") + SafariRelease::DMG_NAME == DOWNLOAD_URL)
    rejects("Invalid GitHub repository") { SafariRelease.download_prefix("../bad", "v2.6.6") }
  },
  "signed release metadata accepted" => -> { assert(validate(APPCAST)) },
  "unsigned and malformed signatures rejected" => -> {
    rejects("unsigned") { validate(APPCAST.sub(" sparkle:edSignature=\"#{SIGNATURE}\"", "")) }
    rejects("unsigned") { validate(APPCAST.sub(SIGNATURE, Base64.strict_encode64("short"))) }
    rejects("invalid base64") { validate(APPCAST.sub(SIGNATURE, "invalid!")) }
  },
  "wrong version, size, URL and multiple items rejected" => -> {
    rejects("version does not match") { validate(APPCAST.sub("<sparkle:version>2.6.6", "<sparkle:version>1")) }
    rejects("archive size") { validate(APPCAST.sub('length="3"', 'length="4"')) }
    rejects("download URL") { validate(APPCAST.sub(DOWNLOAD_URL, "https://example.com/app.dmg")) }
    rejects("exactly one") { validate(APPCAST.sub("</channel>", "<item/></channel>")) }
  },
  "generator failure never exposes private key" => -> {
    Dir.mktmpdir("safari-release-test-") do |root|
      bin = File.join(root, "packages/artifacts/sparkle/Sparkle/bin")
      release = File.join(root, "release")
      FileUtils.mkdir_p([bin, release])
      write_app_plist(release)
      File.write(File.join(release, SafariRelease::DMG_NAME), "dmg")
      generator = File.join(bin, "generate_appcast")
      File.write(generator, "#!/bin/sh\ncat >&2\nexit 1\n")
      File.chmod(0700, generator)
      rejects("generate_appcast failed") do
        SafariRelease.generate_appcast(release_dir: release, packages_dir: File.join(root, "packages"),
          repository: "cu-3rd-party/lms-extension", tag: "v2.6.6", private_key: PRIVATE_KEY)
      end
      assert(!File.exist?(File.join(release, "appcast.xml")))
    end
  },
  "generator receives secret over stdin, validates before copying" => -> {
    Dir.mktmpdir("safari-release-test-") do |root|
      bin = File.join(root, "packages/artifacts/sparkle/Sparkle/bin")
      release = File.join(root, "release")
      FileUtils.mkdir_p([bin, release])
      write_app_plist(release)
      File.write(File.join(release, SafariRelease::DMG_NAME), "dmg")
      # A stale local archive must not be included in the generated feed.
      File.write(File.join(release, "old.dmg"), "old")
      generator = File.join(bin, "generate_appcast")
      File.write(generator, <<~RUBY)
        #!/usr/bin/env ruby
        abort "secret appeared in argv" if ARGV.include?(#{PRIVATE_KEY.inspect})
        abort "stdin missing" unless STDIN.read.strip == #{PRIVATE_KEY.inspect}
        abort "stale archive present" if File.exist?(File.join(ARGV.last, "old.dmg"))
        File.write(ARGV[ARGV.index("-o") + 1], #{APPCAST.inspect})
      RUBY
      File.chmod(0700, generator)
      options = { release_dir: release, packages_dir: File.join(root, "packages"),
        repository: "cu-3rd-party/lms-extension", tag: "v2.6.6", private_key: PRIVATE_KEY }
      SafariRelease.generate_appcast(**options)
      assert(File.read(File.join(release, "appcast.xml")) == APPCAST)
      File.write(generator, "#!/usr/bin/env ruby\nFile.write(ARGV[ARGV.index('-o') + 1], #{APPCAST.sub(" sparkle:edSignature=\"#{SIGNATURE}\"", "").inspect})\n")
      rejects("unsigned") { SafariRelease.generate_appcast(**options) }
      assert(File.read(File.join(release, "appcast.xml")) == APPCAST, "Invalid feed overwrote the signed feed")
      File.write(generator, <<~RUBY)
        #!/usr/bin/env ruby
        warn STDIN.read
        puts "Warning: SUPublicEDKey in the app archive does not match key EdDSA in the Keychain"
        File.write(ARGV[ARGV.index('-o') + 1], #{APPCAST.inspect})
      RUBY
      rejects("inside the DMG") { SafariRelease.generate_appcast(**options) }
      write_app_plist(release, Base64.strict_encode64("x" * 32))
      # Pair validation must happen before the tool is allowed to run.
      File.write(generator, "#!/bin/sh\ntouch #{File.join(root, 'ran')}\nexit 1\n")
      rejects("does not match SUPublicEDKey") { SafariRelease.generate_appcast(**options) }
      assert(!File.exist?(File.join(root, "ran")))
    end
  }
}

tests.each do |name, test|
  test.call
  puts "PASS #{name}"
end
puts "#{tests.length} Safari release checks passed"
