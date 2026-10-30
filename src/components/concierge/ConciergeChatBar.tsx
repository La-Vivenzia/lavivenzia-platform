import { ArrowRight } from "lucide-react";

import { cn } from "@/lib/cn";

/**
 * "Ask the Concierge" — the home page's way into the conversation.
 *
 * A plain GET form to `/concierge`, like `SearchBar` is to `/experiences`: it
 * works before hydration and needs no client state. Whatever is typed becomes
 * the conversation's craving answer; an empty submit simply opens the
 * conversation at its first question.
 */
export function ConciergeChatBar({
  id,
  className,
}: {
  readonly id: string;
  readonly className?: string;
}) {
  return (
    <form method="get" action="/concierge" className={cn("w-full", className)}>
      <label htmlFor={id} className="eyebrow block text-[10px] text-fg-subtle lg:text-[11px]">
        Ask the Concierge
      </label>
      <div className="mt-2.5 flex h-14 items-center gap-3 rounded-pill border border-line bg-surface pr-2 pl-5 shadow-card transition-[border-color,box-shadow] duration-300 focus-within:border-line-strong focus-within:shadow-raised hover:border-line-strong lg:h-[62px] lg:pl-6">
        <input
          id={id}
          type="text"
          name="ask"
          maxLength={80}
          autoComplete="off"
          placeholder="What are you in the mood for tonight?"
          className="min-w-0 flex-1 bg-transparent text-[15px] font-light text-fg placeholder:text-fg-subtle focus:outline-none lg:text-base"
        />
        <button
          type="submit"
          className="inline-flex h-10 shrink-0 items-center gap-2 rounded-pill bg-cta px-4 text-[12.5px] font-medium text-cta-fg transition-[background-color,transform] duration-300 hover:bg-cta-hover active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary lg:h-[46px] lg:px-5"
        >
          <span className="hidden sm:inline">Ask</span>
          <ArrowRight className="h-[17px] w-[17px]" strokeWidth={2} aria-hidden="true" />
          <span className="sr-only sm:hidden">Ask the Concierge</span>
        </button>
      </div>
      <p className="mt-2 pl-5 text-[12px] font-light text-fg-muted lg:pl-6">
        Where you are, what you&rsquo;re craving, who&rsquo;s with you — three questions, then spots
        that fit your real budget.
      </p>
    </form>
  );
}
