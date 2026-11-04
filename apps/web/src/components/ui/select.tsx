import { Children, isValidElement, useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { Popover } from 'radix-ui'
import { Check, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

type Option = { value: string; label: ReactNode }

function optionsFrom(children: ReactNode): Option[] {
  return Children.toArray(children).flatMap(child => {
    if (!isValidElement<{ value?: string; children?: ReactNode }>(child)) return []
    if (child.type !== 'option') return optionsFrom(child.props.children)
    return [{ value: String(child.props.value ?? ''), label: child.props.children }]
  })
}

/** The app's own dropdown, in its theme, used like a <select>: same `value`, `onChange` and <option> children. */
export function Select({
  id,
  value,
  onChange,
  disabled,
  required,
  className,
  children,
  'aria-label': ariaLabel,
}: {
  id?: string
  value: string
  onChange?: (event: { target: { value: string } }) => void
  disabled?: boolean
  required?: boolean
  className?: string
  children: ReactNode
  'aria-label'?: string
}) {
  const options = optionsFrom(children)
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const trigger = useRef<HTMLButtonElement>(null)
  const list = useRef<HTMLUListElement>(null)
  const typed = useRef({ text: '', at: 0 })
  const chosen = options.find(option => option.value === value)
  const items = () => [...(list.current?.querySelectorAll<HTMLElement>('[role="option"]') ?? [])]

  // The list is named by the same words as the button: its aria-label, or its <label> without the button's own text.
  const listName = () => {
    if (ariaLabel) return ariaLabel
    const label = trigger.current?.labels?.[0]
    return label
      ? [...label.childNodes]
          .filter(node => !node.contains(trigger.current))
          .map(node => node.textContent)
          .join('')
          .trim()
      : undefined
  }

  // Each move keeps the focused option in view; opening is handled when the list appears.
  useEffect(() => {
    if (open) items()[active]?.focus()
  }, [open, active])

  function choose(option: Option) {
    setOpen(false)
    if (option.value !== value) onChange?.({ target: { value: option.value } })
  }
  function onKeyDown(event: KeyboardEvent) {
    if (event.ctrlKey || event.metaKey || event.altKey) return
    const last = options.length - 1
    const moves: Record<string, number> = {
      ArrowDown: Math.min(active + 1, last),
      ArrowUp: Math.max(active - 1, 0),
      Home: 0,
      End: last,
    }
    const now = Date.now()
    // A space belongs to the search while typing "san a", and otherwise chooses.
    const searching = now - typed.current.at < 800 && typed.current.text !== ''
    if (event.key in moves) {
      event.preventDefault()
      setActive(moves[event.key])
    } else if (event.key === 'Enter' || (event.key === ' ' && !searching)) {
      event.preventDefault()
      if (options[active]) choose(options[active])
    } else if (event.key === 'Tab') {
      setOpen(false)
    } else if (event.key.length === 1) {
      // Typing jumps to a match, which helps in long lists like the barangays.
      event.preventDefault()
      typed.current = { text: (searching ? typed.current.text : '') + event.key.toLowerCase(), at: now }
      const match = items().findIndex(item => item.textContent?.trim().toLowerCase().startsWith(typed.current.text))
      if (match >= 0) setActive(match)
    }
  }
  return (
    <span className={cn('relative inline-flex w-full', className)}>
      <Popover.Root open={open} onOpenChange={setOpen}>
        <Popover.Trigger asChild>
          <button
            ref={trigger}
            id={id}
            type="button"
            role="combobox"
            aria-label={ariaLabel}
            aria-haspopup="listbox"
            aria-expanded={open}
            aria-required={required || undefined}
            disabled={disabled}
            data-slot="select"
            onKeyDown={event => {
              if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                event.preventDefault()
                setOpen(true)
              }
            }}
            className="flex h-12 w-full min-w-0 items-center justify-between gap-2 rounded-2xl border-2 border-input bg-muted pr-3 pl-3.5 text-left text-base font-bold transition-colors outline-none focus-visible:border-ring focus-visible:bg-card disabled:cursor-not-allowed disabled:opacity-50 data-[state=open]:border-primary lg:h-10 lg:rounded-xl lg:text-sm"
          >
            <span className="truncate">{(chosen ?? options[0])?.label}</span>
            <ChevronDown
              aria-hidden="true"
              className={cn(
                'size-4 shrink-0 text-muted-foreground transition-transform duration-150 motion-reduce:transition-none',
                open && 'rotate-180',
              )}
            />
          </button>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content
            role="presentation"
            align="start"
            sideOffset={6}
            collisionPadding={12}
            onOpenAutoFocus={event => {
              // Focus goes to the current choice, so arrow keys and typing work at once.
              event.preventDefault()
              const current = Math.max(
                0,
                options.findIndex(option => option.value === value),
              )
              typed.current = { text: '', at: 0 }
              setActive(current)
              items()[current]?.focus()
            }}
            className="z-[1000] w-[var(--radix-popover-trigger-width)] min-w-44 rounded-2xl border-2 border-input bg-card p-1.5 text-card-foreground shadow-[0_12px_32px_-12px_rgb(0_0_0/0.35)]"
          >
            <ul
              ref={list}
              role="listbox"
              aria-label={listName()}
              onKeyDown={onKeyDown}
              className="max-h-[min(20rem,calc(var(--radix-popover-content-available-height)-1rem))] overflow-y-auto"
            >
              {options.map((option, index) => {
                const selected = option.value === value
                return (
                  <li
                    key={option.value}
                    role="option"
                    aria-selected={selected}
                    tabIndex={index === active ? 0 : -1}
                    onClick={() => choose(option)}
                    onPointerMove={() => setActive(index)}
                    className={cn(
                      'flex min-h-11 cursor-pointer items-center justify-between gap-2 rounded-xl px-3 py-2 text-[15px] font-semibold outline-none select-none focus:bg-accent',
                      selected && 'text-primary',
                    )}
                  >
                    <span className="min-w-0">{option.label}</span>
                    {selected && <Check aria-hidden="true" className="size-4 shrink-0" strokeWidth={3} />}
                  </li>
                )
              })}
            </ul>
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
      {/* Keeps a required choice in the form's own check; if that check stops here, focus moves to the button. */}
      {required && !disabled && (
        <input
          aria-hidden="true"
          tabIndex={-1}
          required
          value={value}
          onChange={() => {}}
          onFocus={() => trigger.current?.focus()}
          className="pointer-events-none absolute inset-x-0 bottom-0 h-px opacity-0"
        />
      )}
    </span>
  )
}
