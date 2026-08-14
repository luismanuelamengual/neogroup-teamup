import './index.scss'

interface SuperTiebreakValueProps {
  value: number
}

/**
 * A super tiebreak (the 3rd "set" of a TWO_SETS_SUPER_TIEBREAK score) isn't a
 * regular set — it's played to 10 (or beyond) rather than games, and only
 * ever counts as a single set win. So instead of showing its raw point count
 * as if it were a games score, that set is always shown as "0" — sitting on
 * the same baseline as every other set's digit, so it stays aligned with
 * them — with the actual super tiebreak score as a small superscript at its
 * upper-right corner, the same way a tiebreak point count is annotated in
 * regular tennis notation.
 *
 * Sized in `em` so the superscript scales with whatever font-size the
 * surrounding score cell uses — the same markup renders correctly at
 * MatchCard's compact size and MatchInfoModal's larger one.
 */
export default function SuperTiebreakValue({ value }: SuperTiebreakValueProps) {
  return (
    <span className="super-tiebreak-value">
      0<span className="super-tiebreak-points">{value}</span>
    </span>
  )
}
