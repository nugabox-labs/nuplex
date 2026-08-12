/** @type {import('next').NextConfig} */
const nextConfig = {
  // Docker 이미지에 넣는 최소 실행 번들. docker/Dockerfile 의 web 스테이지가 이걸 쓴다.
  output: 'standalone',
  images: {
    // 이미지는 sync 워커가 미리 크기를 맞춰 받아둔다. Next 가 다시 최적화할 필요가 없다.
    unoptimized: true,
  },
}

export default nextConfig
