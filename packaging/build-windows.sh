#!/bin/sh
set -eu

version="${1:?version is required}"
node_archive="${2:?Node.js zip archive is required}"
xray_archive="${3:?Xray zip archive is required}"
winsw_binary="${4:?WinSW executable is required}"
output_dir="${5:-dist}"
root_dir="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
work_dir="$(mktemp -d)"
trap 'rm -rf "$work_dir"' EXIT INT TERM
mkdir -p "$output_dir"
output_dir="$(CDPATH= cd -- "$output_dir" && pwd)"

bundle="$work_dir/WebXray"
mkdir -p "$bundle/app/server" "$bundle/app/frontend" "$bundle/defaults/xray" "$bundle/runtime" "$bundle/data"
cp -R "$root_dir/backend/server/." "$bundle/app/server/"
cp -R "$root_dir/frontend/." "$bundle/app/frontend/"
cp "$root_dir/LICENSE" "$bundle/LICENSE.txt"
cp "$root_dir/README.md" "$bundle/README.md"
cp "$root_dir/CHANGELOG.md" "$bundle/CHANGELOG.md"
cp -R "$root_dir/docs" "$bundle/docs"
cp "$root_dir/THIRD_PARTY_NOTICES.md" "$bundle/THIRD_PARTY_NOTICES.md"
mkdir -p "$bundle/licenses"
cp "$root_dir/packaging/windows/WinSW-LICENSE.txt" "$bundle/licenses/WinSW-LICENSE.txt"
cp "$root_dir/packaging/windows/webxray.cmd" "$bundle/webxray.cmd"
cp "$root_dir/packaging/windows/WebXray-Run.cmd" "$bundle/WebXray-Run.cmd"
cp "$root_dir/packaging/windows/WebXray-Install-Service.cmd" "$bundle/WebXray-Install-Service.cmd"
cp "$root_dir/packaging/windows/WebXray-Uninstall-Service.cmd" "$bundle/WebXray-Uninstall-Service.cmd"
cp "$root_dir/packaging/windows/WebXrayService.xml" "$bundle/WebXrayService.xml"
cp "$root_dir/packaging/windows/data-readme.txt" "$bundle/data/README.txt"
cp "$winsw_binary" "$bundle/WebXrayService.exe"

mkdir -p "$work_dir/node" "$work_dir/xray"
unzip -q "$node_archive" -d "$work_dir/node"
unzip -q "$xray_archive" -d "$work_dir/xray"
node_binary="$(find "$work_dir/node" -type f -iname node.exe -print -quit)"
xray_binary="$(find "$work_dir/xray" -type f -iname xray.exe -print -quit)"
geoip_file="$(find "$work_dir/xray" -type f -name geoip.dat -print -quit)"
geosite_file="$(find "$work_dir/xray" -type f -name geosite.dat -print -quit)"
node_license="$(find "$work_dir/node" -type f -name LICENSE -print -quit)"
xray_license="$(find "$work_dir/xray" -type f \( -name LICENSE -o -name LICENSE.txt \) -print -quit)"
test -n "$node_binary" && test -n "$xray_binary" && test -n "$geoip_file" && test -n "$geosite_file"
cp "$node_binary" "$bundle/runtime/node.exe"
cp "$xray_binary" "$bundle/defaults/xray/xray.exe"
cp "$geoip_file" "$bundle/defaults/xray/geoip.dat"
cp "$geosite_file" "$bundle/defaults/xray/geosite.dat"
if [ -n "$node_license" ]; then cp "$node_license" "$bundle/licenses/Node.js-LICENSE.txt"; fi
if [ -n "$xray_license" ]; then cp "$xray_license" "$bundle/licenses/Xray-LICENSE.txt"; fi

(cd "$work_dir" && zip -qr "$output_dir/webxray_${version}_windows_x64.zip" WebXray)
