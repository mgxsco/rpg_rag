import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { db, users } from '@/lib/db'
import { eq } from 'drizzle-orm'
import bcrypt from 'bcryptjs'

// GET current user profile
export async function GET() {
  try {
    const session = await getSession()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const user = await db.query.users.findFirst({
      where: eq(users.id, session.user.id),
      columns: {
        id: true,
        name: true,
        email: true,
        image: true,
        createdAt: true,
      },
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    return NextResponse.json(user)
  } catch (error) {
    console.error('[User GET] Error:', error)
    return NextResponse.json({ error: 'Failed to fetch user' }, { status: 500 })
  }
}

// PUT update user profile
export async function PUT(request: Request) {
  try {
    const session = await getSession()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { name, image, currentPassword, newPassword } = body

    // Build update object
    const updates: Partial<{ name: string; image: string; password: string }> = {}

    if (name !== undefined) {
      updates.name = name
    }

    if (image !== undefined) {
      updates.image = image
    }

    // Handle password change
    if (newPassword) {
      if (!currentPassword) {
        return NextResponse.json(
          { error: 'Current password is required to change password' },
          { status: 400 }
        )
      }

      // Get current user with password
      const user = await db.query.users.findFirst({
        where: eq(users.id, session.user.id),
      })

      if (!user?.password) {
        return NextResponse.json(
          { error: 'Cannot change password for this account' },
          { status: 400 }
        )
      }

      // Verify current password
      const isValid = await bcrypt.compare(currentPassword, user.password)
      if (!isValid) {
        return NextResponse.json(
          { error: 'Current password is incorrect' },
          { status: 400 }
        )
      }

      // Validate new password
      if (newPassword.length < 6) {
        return NextResponse.json(
          { error: 'New password must be at least 6 characters' },
          { status: 400 }
        )
      }

      // Hash new password
      updates.password = await bcrypt.hash(newPassword, 10)
    }

    // Update user
    if (Object.keys(updates).length > 0) {
      await db.update(users).set(updates).where(eq(users.id, session.user.id))
    }

    // Return updated user (without password)
    const updatedUser = await db.query.users.findFirst({
      where: eq(users.id, session.user.id),
      columns: {
        id: true,
        name: true,
        email: true,
        image: true,
        createdAt: true,
      },
    })

    return NextResponse.json(updatedUser)
  } catch (error) {
    console.error('[User PUT] Error:', error)
    return NextResponse.json({ error: 'Failed to update user' }, { status: 500 })
  }
}
