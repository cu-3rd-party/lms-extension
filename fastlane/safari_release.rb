require "base64"
require "fileutils"
require "open3"
require "rexml/document"
require "tmpdir"
require "uri"

module SafariRelease
  SPARKLE_NAMESPACE = "http://www.andymatuschak.org/xml-namespaces/sparkle"
  DMG_NAME = "lms-extension-safari.dmg"

  def self.version(raw)
    value = raw.to_s.delete_prefix("v")
    unless value.match?(/\A[1-9]\d{0,3}\.(?:0|[1-9]\d?)\.(?:0|[1-9]\d?)\z/)
      raise "Safari version must be MAJOR.MINOR.PATCH (optionally prefixed with v), within CFBundleVersion limits"
    end
    value
  end

  def self.download_prefix(repository, tag)
    unless repository.to_s.match?(/\A[A-Za-z0-9][A-Za-z0-9_.-]*\/[A-Za-z0-9][A-Za-z0-9_.-]*\z/)
      raise "Invalid GitHub repository"
    end
    version(tag)
    "https://github.com/#{repository}/releases/download/#{URI.encode_www_form_component(tag)}/"
  end

  def self.validate_appcast(xml, download_url:, version:, size:)
    document = REXML::Document.new(xml)
    items = REXML::XPath.match(document, "/rss/channel/item")
    raise "Appcast must contain exactly one release" unless items.length == 1

    item = items.first
    namespaces = { "sparkle" => SPARKLE_NAMESPACE }
    build = REXML::XPath.first(item, "sparkle:version", namespaces)&.text
    short_version = REXML::XPath.first(item, "sparkle:shortVersionString", namespaces)&.text
    raise "Appcast version does not match the release" unless build == version && short_version == version

    enclosure = item.elements["enclosure"]
    raise "Appcast is missing the update archive" unless enclosure
    raise "Appcast download URL does not match the release" unless enclosure.attributes["url"] == download_url
    raise "Appcast archive size does not match the DMG" unless enclosure.attributes["length"] == size.to_s

    signature = enclosure.attributes.get_attribute_ns(SPARKLE_NAMESPACE, "edSignature")&.value
    unless signature && Base64.strict_decode64(signature).bytesize == 64
      raise "Appcast is unsigned: check SPARKLE_PRIVATE_KEY and the app's SUPublicEDKey"
    end
    true
  end

  def self.generate_appcast(release_dir:, packages_dir:, repository:, tag:, private_key:)
    raise "SPARKLE_PRIVATE_KEY is required" if private_key.to_s.strip.empty?
    release_version = version(tag)
    prefix = download_prefix(repository, tag)
    generator = Dir.glob(File.join(packages_dir, "artifacts", "**", "bin", "generate_appcast"))
      .find { |path| File.executable?(path) }
    raise "Sparkle generate_appcast not found; add Sparkle to the app target and build first" unless generator

    dmg = File.join(release_dir, DMG_NAME)
    raise "Notarized DMG not found: #{dmg}" unless File.file?(dmg)

    Dir.mktmpdir("lms-sparkle-") do |updates_dir|
      # Isolate this release from stale local archives and feeds.
      FileUtils.cp(dmg, File.join(updates_dir, DMG_NAME))
      appcast = File.join(updates_dir, "appcast.xml")
      _output, _errors, status = Open3.capture3(
        generator, "--ed-key-file", "-", "--download-url-prefix", prefix,
        "--maximum-deltas", "0", "-o", appcast, updates_dir,
        stdin_data: private_key.strip + "\n"
      )
      # Never print the tool's output: it receives the private key over stdin.
      raise "Sparkle generate_appcast failed (exit #{status.exitstatus}); check the signing key and app configuration" unless status.success?

      validate_appcast(
        File.read(appcast), download_url: prefix + DMG_NAME,
        version: release_version, size: File.size(dmg)
      )
      FileUtils.cp(appcast, File.join(release_dir, "appcast.xml"))
    end
  end
end
