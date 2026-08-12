/** @type {import('next').NextConfig} */
const nextConfig = {
  // Docker 이미지에 넣는 최소 실행 번들. docker/Dockerfile 의 web 스테이지가 이걸 쓴다.
  output: 'standalone',
  images: {
    // 이미지는 sync 워커가 미리 크기를 맞춰 받아둔다. Next 가 다시 최적화할 필요가 없다.
    unoptimized: true,
  },
  async headers() {
    return [
      {
        // 앱 웹뷰는 브라우저보다 캐시를 오래 붙든다. HTML 을 캐시하게 두면 웹을
        // 배포해도 앱에서는 며칠씩 구버전 화면이 뜬다. 해시가 붙은 _next/static/*
        // 은 Next 가 알아서 장기 캐시하므로 그대로 둔다 (docs/APP-INTEGRATION.md §2).
        // 포스터(/media/*)와 확장자가 붙은 정적 파일은 제외한다 — 그쪽까지 no-store 로
        // 만들면 스크롤할 때마다 이미지를 다시 받는다.
        source: '/((?!_next|media/|.*\\.).*)',
        headers: [{ key: 'Cache-Control', value: 'no-store, must-revalidate' }],
      },
    ]
  },
}

export default nextConfig
