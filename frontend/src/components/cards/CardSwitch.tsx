/**
 * The iOS-style switch used by Vieques Cards settings rows: Collection's
 * Sound · Card radar (S-6) and Profile's "Show me on Top Traveler" (S-9).
 * Sits in a MenuBody `Row`'s `detail` slot (T-5).
 */
export default function CardSwitch({
  label,
  checked,
  onChange,
  disabled = false,
}: {
  label: string
  checked: boolean
  onChange: (next: boolean) => void
  disabled?: boolean
}) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative h-[30px] w-[50px] shrink-0 rounded-full transition-colors disabled:opacity-60 ${
        checked ? 'bg-primary' : 'bg-white/20'
      }`}
    >
      <span
        className={`absolute left-0 top-[3px] h-6 w-6 rounded-full bg-foreground transition-transform ${
          checked ? 'translate-x-[23px]' : 'translate-x-[3px]'
        }`}
      />
    </button>
  )
}
