#!/bin/bash
# dsh-mobile 插件安装脚本：把移动端适配插件安装到任意 DSH 的 profile。
#
# 用法：
#   ./install.sh                          # 安装到默认位置（~/.dsh 的 web profile）
#   ./install.sh <DSH_HOME> <profile>     # 安装到指定 DSH home 与 profile
#
# 说明：
#   - 把插件文件拷贝到 <DSH_HOME>/profiles/<profile>/node_modules/dsh-mobile/；
#   - 在 cordis.patch.yml 登记插件（幂等，重复执行安全）；
#   - 已挂载插件的文件改动刷新即生效；新增/移除登记才需要重启 dsh web。
set -euo pipefail

DSH_HOME="${1:-$HOME/.dsh}"
PROFILE="${2:-web}"
PROFILE_DIR="$DSH_HOME/profiles/$PROFILE"
DEST_DIR="$PROFILE_DIR/node_modules/dsh-mobile"
SRC_DIR="$(cd "$(dirname "$0")" && pwd)"

if [ ! -f "$SRC_DIR/package.json" ]; then
  echo "错误：未在脚本目录找到插件源文件（package.json 缺失）" >&2
  exit 1
fi

echo "==> 安装 dsh-mobile 到 $PROFILE_DIR"

# 0. profile 目录检查（不代建 package.json，避免破坏 DSH 初始化流程）
if [ ! -d "$PROFILE_DIR" ] || [ ! -f "$PROFILE_DIR/package.json" ]; then
  echo "    注意：profile 尚未初始化。请先运行一次以下命令："
  echo "      dsh --profile $PROFILE web"
  echo "    然后重新执行本脚本。"
  mkdir -p "$PROFILE_DIR"
fi

# 1. 拷贝插件文件
mkdir -p "$DEST_DIR"
cp "$SRC_DIR/package.json" "$SRC_DIR/index.js" "$SRC_DIR/client.js" "$DEST_DIR/"
echo "    已拷贝插件文件到 $DEST_DIR"

# 2. 登记到 cordis.patch.yml（幂等）
PATCH="$PROFILE_DIR/cordis.patch.yml"
if [ ! -f "$PATCH" ]; then
  printf -- "[]\n" > "$PATCH"
fi
if grep -q "name: 'dsh-mobile'" "$PATCH"; then
  echo "    cordis.patch.yml 已登记本插件，跳过"
else
  if grep -q '^\[\]$' "$PATCH"; then
    awk '
      BEGIN { done = 0 }
      /^\[\]$/ && !done {
        print "- insert:"
        print "    - id: dsh-mobile"
        print "      name: '\''dsh-mobile'\''"
        done = 1
        next
      }
      { print }
    ' "$PATCH" > "$PATCH.tmp" && mv "$PATCH.tmp" "$PATCH"
  else
    printf '\n- insert:\n    - id: dsh-mobile\n      name: '\''dsh-mobile'\''\n' >> "$PATCH"
  fi
  echo "    已登记插件到 cordis.patch.yml"
fi

echo "==> 完成。重启 dsh web（首次登记时）并刷新浏览器；此后改 client.js 刷新即生效。"
