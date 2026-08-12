// Plex 섹션 제목은 "영화 | 뮤지컬" 처럼 파이프로 구분돼 있다. 라이브러리 이름은
// Plex 것을 그대로 쓰되(AGENTS.md §2), 화면에서만 가운데점으로 바꿔 보여준다.
// 파이프는 굵은 제목 안에서 세로줄이 너무 튄다.
//
// 구분자는 흐리게 깔아 앞뒤 낱말이 먼저 읽히게 한다.

export function SectionTitle({ title }: { title: string }) {
  const parts = title
    .split('|')
    .map((part) => part.trim())
    .filter(Boolean)

  if (parts.length < 2) return <>{title}</>

  return (
    <>
      {parts.map((part, index) => (
        <span key={part}>
          {index > 0 ? <span className="mx-1.5 font-normal opacity-25">·</span> : null}
          {part}
        </span>
      ))}
    </>
  )
}

/** 제목만 문자열로 필요할 때(메타데이터 · alt 등). */
export function sectionTitleText(title: string): string {
  return title
    .split('|')
    .map((part) => part.trim())
    .filter(Boolean)
    .join(' · ')
}
