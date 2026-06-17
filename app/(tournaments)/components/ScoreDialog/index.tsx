'use client'

import './index.scss'
import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import FormControlLabel from '@mui/material/FormControlLabel'
import Radio from '@mui/material/Radio'
import RadioGroup from '@mui/material/RadioGroup'
import Switch from '@mui/material/Switch'
import TextField from '@mui/material/TextField'
import { useTranslations } from 'next-intl'
import { useEffect, useState } from 'react'
import { MatchDto } from '@/app/(tournaments)/models/MatchDto'
import { MatchScore } from '@/app/(tournaments)/models/MatchScore'
import { MatchSide } from '@/app/(tournaments)/models/MatchSide'
import { ScoreFormat } from '@/app/(tournaments)/models/ScoreFormat'
import { SetScore } from '@/app/(tournaments)/models/SetScore'
import { TournamentDto } from '@/app/(tournaments)/models/TournamentDto'
import { MATCH_SIDE_KEYS } from '@/app/(tournaments)/utils/labels'
import { isValidScore } from '@/app/(tournaments)/utils/score'

interface ScoreDialogProps {
  open: boolean
  tournament: TournamentDto
  match: MatchDto
  saving?: boolean
  onClose: () => void
  onSave: (score: MatchScore) => void
}

type SetInput = { home: string; away: string }

const EMPTY_SET_INPUTS: SetInput[] = [
  { home: '', away: '' },
  { home: '', away: '' },
  { home: '', away: '' }
]

export default function ScoreDialog({ open, tournament, match, saving = false, onClose, onSave }: ScoreDialogProps) {
  const competitorNames = Object.fromEntries((tournament.competitors ?? []).map((c) => [c.id, c.displayName]))
  const scoreFormat = tournament.scoreFormat
  const homeName = match?.homeCompetitorIds.map((id) => competitorNames[id] ?? '').join(' / ')
  const awayName = (match?.awayCompetitorIds ?? []).map((id) => competitorNames[id] ?? '').join(' / ')
  const initialScore = match?.score ?? null
  const t = useTranslations('score')
  const tCommon = useTranslations('common')
  const [walkover, setWalkover] = useState(false)
  const [walkoverWinner, setWalkoverWinner] = useState<MatchSide>(MatchSide.HOME)
  const [sets, setSets] = useState<SetInput[]>(EMPTY_SET_INPUTS)
  const [homeCount, setHomeCount] = useState('')
  const [awayCount, setAwayCount] = useState('')
  const [invalid, setInvalid] = useState(false)

  useEffect(() => {
    if (!open) {
      return
    }

    setInvalid(false)
    setWalkover(!!initialScore?.walkover)
    setWalkoverWinner(initialScore?.walkover ?? MatchSide.HOME)
    setSets(
      initialScore?.sets
        ? EMPTY_SET_INPUTS.map((_, index) => {
            const s = initialScore.sets?.[index]

            return s ? { home: String(s.home), away: String(s.away) } : { home: '', away: '' }
          })
        : EMPTY_SET_INPUTS
    )
    setHomeCount(initialScore?.home != null ? String(initialScore.home) : '')
    setAwayCount(initialScore?.away != null ? String(initialScore.away) : '')
  }, [open, initialScore])

  const usesSets = scoreFormat !== ScoreFormat.BASIC_COUNT

  const updateSet = (index: number, side: MatchSide, raw: string) => {
    const key = MATCH_SIDE_KEYS[side]

    setSets((current) => current.map((set, setIndex) => (setIndex === index ? { ...set, [key]: raw } : set)))
  }

  const handleSave = () => {
    let score: MatchScore

    if (walkover) {
      score = { walkover: walkoverWinner }
    } else if (usesSets) {
      const parsedSets: SetScore[] = sets.map((s) => ({
        home: s.home === '' ? 0 : Number(s.home),
        away: s.away === '' ? 0 : Number(s.away)
      }))

      score = { sets: parsedSets.filter((set) => set.home !== 0 || set.away !== 0) }
    } else {
      score = {
        home: homeCount === '' ? 0 : Number(homeCount),
        away: awayCount === '' ? 0 : Number(awayCount)
      }
    }

    if (!isValidScore(score, scoreFormat)) {
      setInvalid(true)

      return
    }

    onSave(score)
  }

  const setLabel = (index: number) =>
    scoreFormat === ScoreFormat.TWO_SETS_SUPER_TIEBREAK && index === 2
      ? t('superTiebreak')
      : t('set', { number: index + 1 })

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>{t('dialogTitle')}</DialogTitle>
      <DialogContent className="score-dialog">
        {invalid && <Alert severity="error">{t('invalid')}</Alert>}
        <div className="header">
          <span className="competitor home">{homeName}</span>
          <span className="vs">vs</span>
          <span className="competitor away">{awayName}</span>
        </div>
        <FormControlLabel
          control={<Switch checked={walkover} onChange={(event) => setWalkover(event.target.checked)} />}
          label={t('walkoverLabel')}
        />
        {walkover ? (
          <div className="walkover">
            <span className="walkover-title">{t('walkoverWinner')}</span>
            <RadioGroup
              value={walkoverWinner}
              onChange={(event) => setWalkoverWinner(Number(event.target.value) as MatchSide)}
            >
              <FormControlLabel value={MatchSide.HOME} control={<Radio />} label={homeName} />
              <FormControlLabel value={MatchSide.AWAY} control={<Radio />} label={awayName} />
            </RadioGroup>
          </div>
        ) : usesSets ? (
          <div className="sets">
            {sets.map((set, index) => (
              <div key={index} className="set-row">
                <span className="set-label">{setLabel(index)}</span>
                <TextField
                  type="number"
                  size="small"
                  value={set.home}
                  onChange={(event) => updateSet(index, MatchSide.HOME, event.target.value)}
                  slotProps={{ htmlInput: { min: 0, 'aria-label': `${setLabel(index)} ${homeName}` } }}
                />
                <span className="set-separator">-</span>
                <TextField
                  type="number"
                  size="small"
                  value={set.away}
                  onChange={(event) => updateSet(index, MatchSide.AWAY, event.target.value)}
                  slotProps={{ htmlInput: { min: 0, 'aria-label': `${setLabel(index)} ${awayName}` } }}
                />
              </div>
            ))}
          </div>
        ) : (
          <div className="set-row">
            <span className="set-label">{t('games')}</span>
            <TextField
              type="number"
              size="small"
              value={homeCount}
              onChange={(event) => setHomeCount(event.target.value)}
              slotProps={{ htmlInput: { min: 0 } }}
            />
            <span className="set-separator">-</span>
            <TextField
              type="number"
              size="small"
              value={awayCount}
              onChange={(event) => setAwayCount(event.target.value)}
              slotProps={{ htmlInput: { min: 0 } }}
            />
          </div>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{tCommon('cancel')}</Button>
        <Button variant="contained" onClick={handleSave} disabled={saving}>
          {tCommon('save')}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
