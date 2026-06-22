import { BaseEntity, EntityQuery, Scope } from '@neogroup/neorm'
import { getSession } from '../(auth)/services/auth'

export class OrganizationScope implements Scope<BaseEntity> {
  async apply(query: EntityQuery<BaseEntity>): Promise<void> {
    const session = await getSession()

    if (session) {
      if (!session.user.organizationId) {
        throw new Error('User not assigned to any organization')
      }

      query.where('organizationId', session.user.organizationId)
    }
  }
}
