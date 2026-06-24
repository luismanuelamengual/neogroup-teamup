import { Discipline } from '../../(tournaments)/models/Discipline'
import { SubDiscipline } from '../../(tournaments)/models/SubDiscipline'

export interface RankingFilters {
  categoryId?: number | null
  discipline?: Discipline | null
  subDiscipline?: SubDiscipline | null
  page?: number
  pageSize?: number
}
