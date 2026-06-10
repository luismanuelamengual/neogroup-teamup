'use client'

import './ScoreDialog.styles.scss'
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
import { MatchScore, MatchSide, ScoreFormat, SetScore } from '@/app/_models/types'
import { isValidScore } from '@/app/_utils/score'

interface ScoreDialogProps {
  open: boolean
  scoreFormat: ScoreFormat
  homeName: string
  awayName: string
  initialScore: MatchScore | null
  saving?: boolean
  onClose: () => void
  onSave: (score: MatchScore) => void
}

const EMPTY_SETS: SetScore[] = [
  { home: 0, away: 0 },
  { home: 0, away: 0 },
  { home: 0, away: 0 }
]

export default function ScoreDialog({
  open,
  scoreFormat,
  homeName,
  awayName,
  initialScore,
  saving = false,
  onClose,
  onSave
}: ScoreDialogProps) {
  const t = useTranslations('score')
  const tCommon = useTranslations('common')
  const [walkover, setWalkover] = useState(false)
  const [walkoverWinner, setWalkoverWinner] = useState<MatchSide>('home')
  const [sets, setSets] = useState<SetScore[]>(EMPTY_SETS)
  const [homeCount, setHomeCount] = useState(0)
  const [awayCount, setAwayCount] = useState(0)
  const [invalid, setInvalid] = useState(false)

  useEffect(() => {
    if (!open) {
      return
    }

    setInvalid(false)
    setWalkover(!!initialScore?.walkover)
    setWalkoverWinner(initialScore?.walkover ?? 'home')
    setSets(initialScore?.sets ? EMPTY_SETS.map((empty, index) => initialScore.sets?.[index] ?? empty) : EMPTY_SETS)
    setHomeCount(initialScore?.home ?? 0)
    setAwayCount(initialScore?.away ?? 0)
  }, [open, initialScore])

  const usesSets = scoreFormat !== 'basic_count'

  const updateSet = (index: number, side: MatchSide, value: number) => {
    setSets((current) =>
      current.map((set, setIndex) => (setIndex === index ? { ...set, [side]: Math.max(0, value) } : set))
    )
  }

  const handleSave = () => {
    let score: MatchScore

    if (walkover) {
      score = { walkover: walkoverWinner }
    } else if (usesSets) {
      score = { sets: sets.filter((set) => set.home !== 0 || set.away !== 0) }
    } else {
      score = { home: homeCount, away: awayCount }
    }

    if (!isValidScore(score, scoreFormat)) {
      setInvalid(true)

      return
    }

    onSave(score)
  }

  const setLabel = (index: number) =>
    scoreFormat === 'two_sets_super_tiebreak' && index === 2 ? t('superTiebreak') : t('set', { number: index + 1 })

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>{t('dialogTitle')}</DialogTitle>
      <DialogContent className="score-dialog">
        {invalid && <Alert severity="error">{t('invalid')}</Alert>}
        <div className="score-dialog__header">
          <span className="score-dialog__competitor score-dialog__competitor--home">{homeName}</span>
          <span className="score-dialog__vs">vs</span>
          <span className="score-dialog__competitor score-dialog__competitor--away">{awayName}</span>
        </div>
        <FormControlLabel
          control={<Switch checked={walkover} onChange={(event) => setWalkover(event.target.checked)} />}
          label={t('walkoverLabel')}
        />
        {walkover ? (
          <div className="score-dialog__walkover">
            <span className="score-dialog__walkover-title">{t('walkoverWinner')}</span>
            <RadioGroup value={walkoverWinner} onChange={(event) => setWalkoverWinner(event.target.value as MatchSide)}>
              <FormControlLabel value="home" control={<Radio />} label={homeName} />
              <FormControlLabel value="away" control={<Radio />} label={awayName} />
            </RadioGroup>
          </div>
        ) : usesSets ? (
          <div className="score-dialog__sets">
            {sets.map((set, index) => (
              <div key={index} className="score-dialog__set-row">
                <span className="score-dialog__set-label">{setLabel(index)}</span>
                <TextField
                  type="number"
                  size="small"
                  value={set.home}
                  onChange={(event) => updateSet(index, 'home', Number(event.target.value))}
                  slotProps={{ htmlInput: { min: 0, 'aria-label': `${setLabel(index)} ${homeName}` } }}
                />
                <span className="score-dialog__set-separator">-</span>
                <TextField
                  type="number"
                  size="small"
                  value={set.away}
                  onChange={(event) => updateSet(index, 'away', Number(event.target.value))}
                  slotProps={{ htmlInput: { min: 0, 'aria-label': `${setLabel(index)} ${awayName}` } }}
                />
              </div>
            ))}
          </div>
        ) : (
          <div className="score-dialog__set-row">
            <span className="score-dialog__set-label">{t('games')}</span>
            <TextField
              type="number"
              size="small"
              value={homeCount}
              onChange={(event) => setHomeCount(Math.max(0, Number(event.target.value)))}
              slotProps={{ htmlInput: { min: 0 } }}
            />
            <span className="score-dialog__set-separator">-</span>
            <TextField
              type="number"
              size="small"
              value={awayCount}
              onChange={(event) => setAwayCount(Math.max(0, Number(event.target.value)))}
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
