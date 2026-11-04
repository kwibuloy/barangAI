import { useState } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Select } from '../src/components/ui/select'

function Picker({ onChange = () => {}, disabled = false }: { onChange?: (value: string) => void; disabled?: boolean }) {
  const [value, setValue] = useState('')
  return (
    <label>
      Barangay
      <Select
        value={value}
        disabled={disabled}
        onChange={event => {
          setValue(event.target.value)
          onChange(event.target.value)
        }}
      >
        <option value="">All barangays</option>
        {['San Jose', 'Zone I'].map(name => (
          <option key={name} value={name}>
            {name}
          </option>
        ))}
      </Select>
    </label>
  )
}

afterEach(cleanup)

describe('the app dropdown', () => {
  it('is named by its label, shows the choice and is not the device picker', () => {
    render(<Picker />)
    const button = screen.getByLabelText('Barangay')
    expect(button).toHaveAttribute('role', 'combobox')
    expect(button).toHaveTextContent('All barangays')
    expect(document.querySelector('select')).toBeNull()
  })

  it('opens a themed list, marks the choice and reports a new one', () => {
    const onChange = vi.fn()
    render(<Picker onChange={onChange} />)
    fireEvent.click(screen.getByLabelText('Barangay'))
    expect(screen.getByRole('option', { name: 'All barangays' })).toHaveAttribute('aria-selected', 'true')
    fireEvent.click(screen.getByRole('option', { name: 'Zone I' }))
    expect(onChange).toHaveBeenCalledWith('Zone I')
    expect(screen.queryByRole('listbox')).toBeNull()
    expect(screen.getByLabelText('Barangay')).toHaveTextContent('Zone I')
  })

  it('moves focus into the list on opening, so the keyboard works there', () => {
    const onChange = vi.fn()
    render(<Picker onChange={onChange} />)
    const button = screen.getByLabelText('Barangay')
    button.focus()
    fireEvent.keyDown(button, { key: 'ArrowDown' })
    expect(document.activeElement).toHaveAttribute('role', 'option')
    expect(document.activeElement).toHaveTextContent('All barangays')
    expect(screen.getByRole('listbox')).toHaveAccessibleName('Barangay')
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowDown' })
    expect(document.activeElement).toHaveTextContent('San Jose')
    fireEvent.keyDown(document.activeElement!, { key: 'Enter' })
    expect(onChange).toHaveBeenLastCalledWith('San Jose')
    expect(screen.queryByRole('listbox')).toBeNull()
  })

  it('opens on the current choice and lets typing, with spaces, jump to a match', () => {
    const onChange = vi.fn()
    render(<Picker onChange={onChange} />)
    fireEvent.click(screen.getByLabelText('Barangay'))
    for (const key of 'zone i') fireEvent.keyDown(document.activeElement!, { key })
    expect(document.activeElement).toHaveTextContent('Zone I')
    expect(screen.getByRole('listbox')).toBeInTheDocument()
    fireEvent.keyDown(document.activeElement!, { key: 'Enter' })
    expect(onChange).toHaveBeenLastCalledWith('Zone I')
    fireEvent.click(screen.getByLabelText('Barangay'))
    expect(document.activeElement).toHaveTextContent('Zone I')
  })

  it('ignores shortcuts like Ctrl+C and closes on Escape', () => {
    render(<Picker />)
    fireEvent.click(screen.getByLabelText('Barangay'))
    fireEvent.keyDown(document.activeElement!, { key: 'z', ctrlKey: true })
    expect(document.activeElement).toHaveTextContent('All barangays')
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' })
    expect(screen.queryByRole('listbox')).toBeNull()
  })

  it('stays shut when disabled', () => {
    render(<Picker disabled />)
    fireEvent.click(screen.getByLabelText('Barangay'))
    expect(screen.queryByRole('listbox')).toBeNull()
  })
})
