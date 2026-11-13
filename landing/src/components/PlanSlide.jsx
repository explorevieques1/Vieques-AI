import { useEffect, useRef, useState } from 'react'
import SlideCommit from './reactbits/SlideCommit.jsx'

// A full-width <SlideCommit> for a pricing card. SlideCommit takes a pixel
// width, so this measures the card's content box and re-renders on resize.
// Colours follow the landing palette: orange handle (it is the buy action),
// --pearl-3 track, --sea success.
export default function PlanSlide({ picked, ...props }) {
  const ref = useRef(null)
  const [width, setWidth] = useState(0)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  return (
    <div ref={ref} className={picked ? 'plan-slide picked' : 'plan-slide'}>
      {width > 0 && (
        <SlideCommit
          width={width}
          height={56}
          radius={28}
          trackColor="#112C3B"
          handleColor="#FF6D04"
          successColor="#64DBE8"
          dangerColor="#E5484D"
          doneLabel="Opening checkout"
          errorLabel="Couldn’t open checkout"
          holdMs={0}
          {...props}
        />
      )}
    </div>
  )
}
