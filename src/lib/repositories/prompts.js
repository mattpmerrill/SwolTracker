/**
 * AI prompt template CRUD repository.
 */
export function createPromptsRepo(supabase) {
  const getPromptTemplate = async (templateName) => {
    if (!supabase) return null
    const { data, error } = await supabase
      .rpc('get_prompt_template', { template_name: templateName })

    if (error) {
      console.error('Error fetching prompt template:', error)
      return null
    }
    return data
  }

  const getAllPromptTemplates = async () => {
    if (!supabase) return []
    const { data, error } = await supabase
      .rpc('get_all_prompt_templates')

    if (error) {
      console.error('Error getting prompt templates:', error)
      return []
    }
    return data || []
  }

  const createPromptTemplate = async (name, description, template) => {
    if (!supabase) return null
    const { data, error } = await supabase
      .rpc('create_prompt_template', {
        p_name: name,
        p_description: description,
        p_template: template
      })

    if (error) {
      console.error('Error creating prompt template:', error)
      return null
    }
    return data
  }

  const updatePromptTemplate = async (id, name, description, template) => {
    if (!supabase) return false
    const { data, error } = await supabase
      .rpc('update_prompt_template', {
        p_id: id,
        p_name: name,
        p_description: description,
        p_template: template
      })

    if (error) {
      console.error('Error updating prompt template:', error)
      return false
    }
    return data
  }

  const deletePromptTemplate = async (id) => {
    if (!supabase) return false
    const { data, error } = await supabase
      .rpc('delete_prompt_template', { p_id: id })

    if (error) {
      console.error('Error deleting prompt template:', error)
      return false
    }
    return data
  }

  return {
    getPromptTemplate,
    getAllPromptTemplates,
    createPromptTemplate,
    updatePromptTemplate,
    deletePromptTemplate,
  }
}
