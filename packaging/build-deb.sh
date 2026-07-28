#!/bin/sh
set -eu

version="${1:?version is required}"
arch="${2:?Debian architecture is required}"
xray_archive="${3:?Xray zip archive is required}"
node_archive="${4:?Node.js tar archive is required}"
output_dir="${5:-dist}"
root_dir="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
work_dir="$(mktemp -d)"
trap 'rm -rf "$work_dir"' EXIT INT TERM

package_dir="$work_dir/package"
xray_dir="$work_dir/xray"
node_dir="$work_dir/node"
mkdir -p \
  "$package_dir/DEBIAN" \
  "$package_dir/usr/bin" \
  "$package_dir/usr/lib/webxray/server" \
  "$package_dir/usr/lib/webxray/defaults/xray" \
  "$package_dir/usr/lib/webxray/runtime" \
  "$package_dir/usr/share/webxray/frontend" \
  "$package_dir/usr/share/doc/webxray" \
  "$package_dir/lib/systemd/system" \
  "$xray_dir" "$node_dir" \
  "$output_dir"

cp -R "$root_dir/backend/server/." "$package_dir/usr/lib/webxray/server/"
cp -R "$root_dir/frontend/." "$package_dir/usr/share/webxray/frontend/"
cp "$root_dir/LICENSE" "$package_dir/usr/share/doc/webxray/copyright"
cp "$root_dir/README.md" "$package_dir/usr/share/doc/webxray/README.md"
cp "$root_dir/CHANGELOG.md" "$package_dir/usr/share/doc/webxray/CHANGELOG.md"
cp -R "$root_dir/docs" "$package_dir/usr/share/doc/webxray/docs"
cp "$root_dir/THIRD_PARTY_NOTICES.md" "$package_dir/usr/share/doc/webxray/THIRD_PARTY_NOTICES.md"
install -m 0755 "$root_dir/packaging/linux/webxray" "$package_dir/usr/bin/webxray"
install -m 0644 "$root_dir/packaging/linux/webxray.service" "$package_dir/lib/systemd/system/webxray.service"

unzip -q "$xray_archive" -d "$xray_dir"
tar -xf "$node_archive" -C "$node_dir"
xray_binary="$(find "$xray_dir" -type f -name xray -print -quit)"
node_binary="$(find "$node_dir" -type f -name node -print -quit)"
geoip_file="$(find "$xray_dir" -type f -name geoip.dat -print -quit)"
geosite_file="$(find "$xray_dir" -type f -name geosite.dat -print -quit)"
xray_license="$(find "$xray_dir" -type f \( -name LICENSE -o -name LICENSE.txt \) -print -quit)"
node_license="$(find "$node_dir" -type f -name LICENSE -print -quit)"
test -n "$xray_binary" && test -n "$node_binary" && test -n "$geoip_file" && test -n "$geosite_file"
install -m 0755 "$node_binary" "$package_dir/usr/lib/webxray/runtime/node"
install -m 0755 "$xray_binary" "$package_dir/usr/lib/webxray/defaults/xray/xray"
install -m 0644 "$geoip_file" "$package_dir/usr/lib/webxray/defaults/xray/geoip.dat"
install -m 0644 "$geosite_file" "$package_dir/usr/lib/webxray/defaults/xray/geosite.dat"
if [ -n "$xray_license" ]; then
  install -m 0644 "$xray_license" "$package_dir/usr/share/doc/webxray/Xray-LICENSE.txt"
fi
if [ -n "$node_license" ]; then
  install -m 0644 "$node_license" "$package_dir/usr/share/doc/webxray/Node.js-LICENSE.txt"
fi

sed -e "s/@VERSION@/$version/g" -e "s/@ARCH@/$arch/g" \
  "$root_dir/packaging/debian/control.in" > "$package_dir/DEBIAN/control"
for script in postinst prerm postrm; do
  install -m 0755 "$root_dir/packaging/debian/$script" "$package_dir/DEBIAN/$script"
done

dpkg-deb --root-owner-group --build "$package_dir" "$output_dir/webxray_${version}_${arch}.deb"
