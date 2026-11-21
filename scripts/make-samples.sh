#!/usr/bin/env bash
# 生成本地测试视频（需要 ffmpeg）/ Generate local test videos (requires ffmpeg)
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p samples
# 横屏 1280×720 · 30fps · 8s · H.264 + AAC
ffmpeg -loglevel error -y -f lavfi -i testsrc2=size=1280x720:rate=30:duration=8 \
  -f lavfi -i sine=frequency=440:duration=8 \
  -c:v libx264 -pix_fmt yuv420p -g 60 -c:a aac -shortest samples/landscape.mp4
# 带旋转元数据的视频（模拟手机竖拍）/ Video with rotation metadata (like a phone recording)
ffmpeg -loglevel error -y -f lavfi -i testsrc2=size=1280x720:rate=30:duration=5 \
  -c:v libx264 -pix_fmt yuv420p -g 30 samples/_tmp.mp4
ffmpeg -loglevel error -y -display_rotation 90 -i samples/_tmp.mp4 -c copy samples/rotated.mp4
rm samples/_tmp.mp4
echo "✓ samples/landscape.mp4, samples/rotated.mp4"
