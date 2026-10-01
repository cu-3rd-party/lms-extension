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

tests = {
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
      File.write(File.join(release, SafariRelease::DMG_NAME), "dmg")
      generator = File.join(bin, "generate_appcast")
      File.write(generator, "#!/bin/sh\ncat >&2\nexit 1\n")
      File.chmod(0700, generator)
      rejects("generate_appcast failed") do
        SafariRelease.generate_appcast(release_dir: release, packages_dir: File.join(root, "packages"),
          repository: "cu-3rd-party/lms-extension", tag: "v2.6.6", private_key: "secret-test-key")
      end
      assert(!File.exist?(File.join(release, "appcast.xml")))
    end
  },
  "generator receives secret over stdin, validates before copying" => -> {
    Dir.mktmpdir("safari-release-test-") do |root|
      bin = File.join(root, "packages/artifacts/sparkle/Sparkle/bin")
      release = File.join(root, "release")
      FileUtils.mkdir_p([bin, release])
      File.write(File.join(release, SafariRelease::DMG_NAME), "dmg")
      # A stale local archive must not be included in the generated feed.
      File.write(File.join(release, "old.dmg"), "old")
      generator = File.join(bin, "generate_appcast")
      File.write(generator, <<~RUBY)
        #!/usr/bin/env ruby
        abort "secret appeared in argv" if ARGV.include?("secret-test-key")
        abort "stdin missing" unless STDIN.read.strip == "secret-test-key"
        abort "stale archive present" if File.exist?(File.join(ARGV.last, "old.dmg"))
        File.write(ARGV[ARGV.index("-o") + 1], #{APPCAST.inspect})
      RUBY
      File.chmod(0700, generator)
      options = { release_dir: release, packages_dir: File.join(root, "packages"),
        repository: "cu-3rd-party/lms-extension", tag: "v2.6.6", private_key: "secret-test-key" }
      SafariRelease.generate_appcast(**options)
      assert(File.read(File.join(release, "appcast.xml")) == APPCAST)
      File.write(generator, "#!/usr/bin/env ruby\nFile.write(ARGV[ARGV.index('-o') + 1], #{APPCAST.sub(" sparkle:edSignature=\"#{SIGNATURE}\"", "").inspect})\n")
      rejects("unsigned") { SafariRelease.generate_appcast(**options) }
      assert(File.read(File.join(release, "appcast.xml")) == APPCAST, "Invalid feed overwrote the signed feed")
    end
  }
}

tests.each do |name, test|
  test.call
  puts "PASS #{name}"
end
puts "#{tests.length} Safari release checks passed"
