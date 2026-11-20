import { RotateCw } from 'lucide-react'

/** S-6 load failure: "Couldn't load <what>." + "Try again". Shared by the Collection tabs. */
export default function LoadFailed({ what, onRetry }: { what: string; onRetry: () => void }) {
  return (
    <div className="px-2 py-10 text-center">
      <p className="text-sm text-muted-foreground">Couldn't load {what}.</p>
      <button
        onClick={onRetry}
        className="mt-3 inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-sm text-primary hover:bg-white/5"
      >
        <RotateCw size={14} />
        Try again
      </button>
    </div>
  )
}
