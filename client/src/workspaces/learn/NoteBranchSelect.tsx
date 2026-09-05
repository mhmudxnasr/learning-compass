import { useData } from '../../app/useData'

export function NoteBranchSelect({
  value,
  label,
  onChange,
  allowEmpty = true,
}: {
  value: string
  label?: string | null
  onChange: (id: string) => void
  allowEmpty?: boolean
}) {
  const branches = useData<{ existing?: Array<{ id: string; label: string; status?: string }> }>('/brain/branch-deck')
  const options = (branches.data?.existing || []).filter((branch) => branch.status !== 'pruned')
  return (
    <label>
      Branch
      <select aria-label="Note branch" value={value} onChange={(event) => onChange(event.currentTarget.value)}>
        {allowEmpty && <option value="">Unassigned</option>}
        {value && !options.some((branch) => branch.id === value) && (
          <option value={value}>{label || 'Current branch'}</option>
        )}
        {options.map((branch) => (
          <option key={branch.id} value={branch.id}>
            {branch.label}
          </option>
        ))}
      </select>
      {branches.error && <small role="alert">Branch choices could not load. Your current branch is preserved.</small>}
    </label>
  )
}
