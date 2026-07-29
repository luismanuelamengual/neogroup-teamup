import { getOrganization } from '@/app/services/organizations'
async function main() {
  try {
    const org = await getOrganization({ id: 1 })
    console.log('OK', org)
  } catch (e) {
    console.log('ERR', e)
  }
}
main()
