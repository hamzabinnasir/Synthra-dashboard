import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { supabase } from '../../../../../lib/supabase.js'
import { getCurrentAdmin, verifyPassword, hashPassword } from '../../../../../lib/auth.js'
import {
  cloudinaryConfigured,
  destroyCloudinaryAsset,
  parseImageDataUrl,
  uploadImageBuffer,
} from '../../../../../lib/cloudinary.js'

export const dynamic = 'force-dynamic'

async function persistImage(dataUrl, folder, previousPublicId) {
  if (dataUrl === null || dataUrl === '') {
    if (previousPublicId) await destroyCloudinaryAsset(previousPublicId)
    return { url: null, public_id: null }
  }
  const parsed = parseImageDataUrl(dataUrl)
  if (parsed.kind === 'url') {
    return { url: parsed.url, public_id: previousPublicId || null }
  }
  if (!cloudinaryConfigured()) {
    throw new Error('Cloudinary is not configured. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET.')
  }
  let uploaded
  try {
    uploaded = await uploadImageBuffer(parsed.buffer, {
      folder,
      mimeType: parsed.mimeType,
      filename: folder.endsWith('avatar') ? 'avatar' : 'cover',
    })
  } catch (err) {
    // Surface Cloudinary failures as their own error instead of a bare message,
    // so they are not mistaken for a login/session problem.
    const wrapped = new Error(`Cloudinary upload failed: ${err.message}`)
    wrapped.status = 502
    throw wrapped
  }
  if (previousPublicId && previousPublicId !== uploaded.public_id) {
    await destroyCloudinaryAsset(previousPublicId)
  }
  return uploaded
}

export async function GET() {
  try {
    const cookieStore = await cookies()
    const admin = await getCurrentAdmin(cookieStore)
    if (!admin) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }
    return NextResponse.json({ success: true, user: admin })
  } catch (err) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}

export async function POST(request) {
  try {
    const cookieStore = await cookies()
    const admin = await getCurrentAdmin(cookieStore)
    if (!admin) {
      console.warn('[admin/profile] POST rejected: session cookie missing, invalid, expired, or user not found')
      return NextResponse.json(
        { success: false, error: 'Your session is invalid or has expired. Please sign in again.', code: 'SESSION_INVALID' },
        { status: 401 }
      )
    }

    const body = await request.json()
    const { name, email, currentPassword, newPassword, avatar, cover } = body

    let fullUser = null
    {
      const result = await supabase.from('admin_users').select('*').eq('id', admin.id).maybeSingle()
      fullUser = result.data
      if (!fullUser && admin.email) {
        const byEmail = await supabase.from('admin_users').select('*').eq('email', admin.email).maybeSingle()
        fullUser = byEmail.data
      }
    }

    const updateFields = {
      updated_at: new Date().toISOString(),
    }

    if (typeof name === 'string' && name.trim()) {
      updateFields.name = name.trim()
    }

    if (email && email.trim() && email.trim().toLowerCase() !== admin.email) {
      if (!currentPassword) {
        return NextResponse.json(
          { success: false, error: 'Current password is required to change your email address' },
          { status: 400 }
        )
      }
      if (!fullUser?.password_hash || !verifyPassword(currentPassword, fullUser.password_hash)) {
        return NextResponse.json({ success: false, error: 'Current password is incorrect' }, { status: 400 })
      }
      updateFields.email = email.trim().toLowerCase()
    }

    if (newPassword) {
      if (!currentPassword) {
        return NextResponse.json(
          { success: false, error: 'Current password is required to set a new password' },
          { status: 400 }
        )
      }
      if (!fullUser?.password_hash || !verifyPassword(currentPassword, fullUser.password_hash)) {
        return NextResponse.json({ success: false, error: 'Current password is incorrect' }, { status: 400 })
      }
      if (newPassword.length < 8) {
        return NextResponse.json(
          { success: false, error: 'New password must be at least 8 characters long' },
          { status: 400 }
        )
      }
      updateFields.password_hash = hashPassword(newPassword)
    }

    if (avatar !== undefined) {
      const uploaded = await persistImage(avatar, 'synthra/admin/avatar', fullUser?.avatar_public_id)
      updateFields.avatar_url = uploaded.url
      updateFields.avatar_public_id = uploaded.public_id
    }
    if (cover !== undefined) {
      const uploaded = await persistImage(cover, 'synthra/admin/cover', fullUser?.cover_public_id)
      updateFields.cover_url = uploaded.url
      updateFields.cover_public_id = uploaded.public_id
    }

    let saved = fullUser
    if (fullUser) {
      const { data, error } = await supabase
        .from('admin_users')
        .update(updateFields)
        .eq('id', fullUser.id)
        .select('id,email,name,avatar_url,cover_url,updated_at')
        .single()
      if (error) {
        const retryFields = { ...updateFields }
        delete retryFields.avatar_public_id
        delete retryFields.cover_public_id
        const retry = await supabase
          .from('admin_users')
          .update(retryFields)
          .eq('id', fullUser.id)
          .select('id,email,name,avatar_url,cover_url,updated_at')
          .single()
        if (retry.error) {
          return NextResponse.json({ success: false, error: retry.error.message }, { status: 500 })
        }
        saved = retry.data
      } else {
        saved = data
      }
    } else {
      const insertRow = {
        email: updateFields.email || admin.email,
        name: updateFields.name || admin.name || 'Admin',
        password_hash: updateFields.password_hash || hashPassword(crypto.randomUUID()),
        avatar_url: updateFields.avatar_url ?? null,
        cover_url: updateFields.cover_url ?? null,
        updated_at: updateFields.updated_at,
      }
      const { data, error } = await supabase
        .from('admin_users')
        .insert(insertRow)
        .select('id,email,name,avatar_url,cover_url,updated_at')
        .single()
      if (error) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 })
      }
      saved = data
    }

    const { data: fresh } = await supabase
      .from('admin_users')
      .select('id,email,name,avatar_url,cover_url,created_at,updated_at')
      .eq('id', saved.id)
      .maybeSingle()

    return NextResponse.json({
      success: true,
      message: 'Profile updated successfully',
      user: fresh || saved,
    })
  } catch (err) {
    console.error('[admin/profile] save failed:', err)
    return NextResponse.json(
      { success: false, error: err.message || 'Profile update failed' },
      { status: err.status || 500 }
    )
  }
}
