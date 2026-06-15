/**
 * Creates dummy users in the local SQLite database.
 *
 * Usage: npx tsx scripts/createDummyUsers.ts <count>
 *
 * Example: npx tsx scripts/createDummyUsers.ts 20
 */
import { config } from 'dotenv'

config({ path: '.env.local' })
config({ path: '.env' })

import bcrypt from 'bcryptjs'
import { DB } from '@neogroup/neorm'
import { User } from '@/app/(auth)/models/User'
import { Role } from '@/app/(auth)/models/Role'

const FIRST_NAMES = [
  'Alejandro', 'María', 'Juan', 'Laura', 'Carlos', 'Ana', 'Luis', 'Sofía',
  'Diego', 'Valentina', 'Martín', 'Camila', 'Andrés', 'Isabella', 'Felipe',
  'Daniela', 'Santiago', 'Gabriela', 'Sebastián', 'Lucía', 'Mateo', 'Paula',
  'Nicolás', 'Andrea', 'Ricardo', 'Fernanda', 'Roberto', 'Natalia', 'Javier',
  'Patricia', 'Miguel', 'Verónica', 'Ignacio', 'Claudia', 'Rodrigo', 'Beatriz',
]

const LAST_NAMES = [
  'García', 'Martínez', 'López', 'González', 'Pérez', 'Rodríguez', 'Sánchez',
  'Ramírez', 'Torres', 'Flores', 'Rivera', 'Gómez', 'Díaz', 'Cruz', 'Morales',
  'Reyes', 'Herrera', 'Medina', 'Ruiz', 'Vargas', 'Romero', 'Jiménez', 'Alvarado',
  'Moreno', 'Muñoz', 'Vega', 'Castillo', 'Ramos', 'Ortiz', 'Silva', 'Mendoza',
  'Guerrero', 'Delgado', 'Navarro', 'Aguilar', 'Acosta', 'Soto', 'Contreras',
]

function randomItem<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

async function run(): Promise<void> {
  const count = parseInt(process.argv[2] ?? '', 10)

  if (isNaN(count) || count <= 0) {
    console.error('Usage: npx tsx scripts/createDummyUsers.ts <count>')
    console.error('Example: npx tsx scripts/createDummyUsers.ts 20')
    process.exit(1)
  }

  const passwordHash = await bcrypt.hash('123qwe', 10)
  let created = 0
  let skipped = 0

  console.log(`Creating ${count} dummy user(s)...`)

  for (let i = 0; i < count; i++) {
    // Insert first to get the auto-generated ID, then derive the email from it.
    const user = new User()
    user.firstName = randomItem(FIRST_NAMES)
    user.lastName = randomItem(LAST_NAMES)
    user.nickname = null
    user.passwordHash = passwordHash
    user.roleId = Role.PLAYER
    // Temporary placeholder — will be replaced after we know the ID.
    user.email = `dummy_placeholder_${Date.now()}_${i}@gmail.com`

    try {
      await user.save()

      // Now update email to the canonical "m{id}@gmail.com" format.
      const finalEmail = `m${user.id}@gmail.com`
      const existing = await User.where('email', finalEmail).first()

      if (existing) {
        // Edge case: a real user already owns this address — skip.
        await DB.table('users').where('id', user.id).delete()
        skipped++
        continue
      }

      await DB.table('users').where('id', user.id).update({ email: finalEmail })
      user.email = finalEmail

      console.log(`  [${i + 1}/${count}] Created user #${user.id}: ${user.firstName} ${user.lastName} <${user.email}>`)
      created++
    } catch (err: any) {
      console.warn(`  [${i + 1}/${count}] Skipped (error: ${err?.message ?? err})`)
      skipped++
    }
  }

  console.log(`\nDone. ${created} user(s) created, ${skipped} skipped.`)
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Failed:', err)
    process.exit(1)
  })
