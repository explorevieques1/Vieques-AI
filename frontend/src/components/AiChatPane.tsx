import AiChatBody from './AiChatBody'

type Props = { onClose: () => void }

/**
 * Desktop shell for the Ask AI chat.
 *
 * A self-positioned floating panel rather than a ResponsivePanel: on phones that
 * would render a vaul Drawer, and the map's results sheet is already one — two
 * nested drawers fight over the same drag handling.
 *
 * Mobile does not use this at all any more. The chat renders as the map sheet's
 * content (see MapView's `sheetBody`), which is what §7 of the mobile rebuild
 * asks for and also retires the hardcoded `top-[calc(env(safe-area-inset-top)+
 * 6.25rem)]` offset this used to carry to clear the two-row phone top bar —
 * an offset that silently broke every time that bar changed height.
 */
export default function AiChatPane({ onClose }: Props) {
  return (
    <aside
      className="glass pointer-events-auto absolute bottom-5 right-5 top-[5.5rem] z-40 flex w-[400px]
                 flex-col overflow-hidden rounded-3xl shadow-2xl"
    >
      <AiChatBody onClose={onClose} />
    </aside>
  )
}
