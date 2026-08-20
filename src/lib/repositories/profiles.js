/**
 * Profile & Avatar repository
 */
export function createProfilesRepo(supabase) {
  const getProfile = async (userId) => {
    if (!supabase) return null
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single()
    return data
  }

  const updateProfile = async (userId, updates) => {
    if (!supabase) return null
    const { data } = await supabase
      .from('profiles')
      .update(updates)
      .eq('id', userId)
      .select()
      .single()
    return data
  }

  const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
  const MAX_AVATAR_SIZE = 5 * 1024 * 1024 // 5MB

  const uploadAvatar = async (userId, file) => {
    if (!supabase) return { error: 'Not configured' }

    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
      return { error: 'Invalid file type. Please upload a JPEG, PNG, WebP, or GIF image.' }
    }
    if (file.size > MAX_AVATAR_SIZE) {
      return { error: 'File too large. Maximum size is 5MB.' }
    }

    try {
      const fileExt = file.name.split('.').pop().toLowerCase()
      const fileName = `${userId}/${Date.now()}.${fileExt}`

      const { data: existingFiles } = await supabase.storage
        .from('avatars')
        .list(userId)

      if (existingFiles?.length) {
        const filePaths = existingFiles.map(f => `${userId}/${f.name}`)
        await supabase.storage.from('avatars').remove(filePaths)
      }

      const { error } = await supabase.storage
        .from('avatars')
        .upload(fileName, file, {
          cacheControl: '3600',
          upsert: true
        })

      if (error) return { error: error.message }

      const { data: { publicUrl } } = supabase.storage
        .from('avatars')
        .getPublicUrl(fileName)

      await updateProfile(userId, {
        avatar_url: publicUrl,
        avatar: null
      })

      return { url: publicUrl }
    } catch (error) {
      console.error('Error uploading avatar:', error)
      return { error: error.message }
    }
  }

  const deleteAvatar = async (userId) => {
    if (!supabase) return false

    try {
      const { data: files } = await supabase.storage
        .from('avatars')
        .list(userId)

      if (files?.length) {
        const filePaths = files.map(f => `${userId}/${f.name}`)
        await supabase.storage.from('avatars').remove(filePaths)
      }

      await updateProfile(userId, { avatar_url: null })
      return true
    } catch (error) {
      console.error('Error deleting avatar:', error)
      return false
    }
  }

  return { getProfile, updateProfile, uploadAvatar, deleteAvatar }
}
