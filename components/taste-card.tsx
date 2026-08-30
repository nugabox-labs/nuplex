import { Sparkles } from 'lucide-react'

// "내 취향" 맨 위 카드. 무엇을 좋아하는 사람인지 한 문단으로 말해준다.
//
// 만드는 일은 sync 워커가 미리 한다(sync/taste.ts). 여기는 담긴 것을 그리기만 하므로
// 클라이언트 컴포넌트일 이유가 없다 — 기다리는 상태도, 다시 부르는 길도 없다.

export function TasteCard({ summary, tags }: { summary: string; tags: string[] }) {
  return (
    <section className="rounded-xl border border-border bg-card/60 p-5 md:p-6">
      <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-primary">
        <Sparkles className="h-4 w-4" />
        내 취향 분석
      </h2>

      <p className="text-base leading-relaxed text-foreground md:text-lg">{summary}</p>

      {tags.length > 0 ? (
        <ul className="mt-4 flex flex-wrap gap-2">
          {tags.map((tag) => (
            <li
              key={tag}
              className="rounded-full border border-primary/30 bg-primary/10 px-3.5 py-1.5 text-sm font-medium text-primary md:text-base"
            >
              {tag}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  )
}
