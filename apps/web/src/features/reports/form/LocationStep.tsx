import { m } from 'motion/react'
import { CheckCircle2, ChevronRight, Info, LoaderCircle, LocateFixed, Map as MapIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Txt } from '../../../lib/i18n'
import { MapPicker } from '../MapPicker'
import type { LocationSource } from '../location'
import { Card } from './shared'

/** Step 2 of 4: GPS, a map pin or typed coordinates. The form holds the pin; this only shows and changes it. */
export function LocationStep({
  locating,
  onLocate,
  showMap,
  onToggleMap,
  located,
  streetName,
  coordinates,
  locationSource,
  place,
  gpsProblem,
  latitude,
  longitude,
  onPlacePin,
}: {
  locating: boolean
  onLocate: () => void
  showMap: boolean
  onToggleMap: () => void
  located: boolean
  streetName: string | null | undefined
  coordinates: string
  locationSource: LocationSource
  place: { barangay?: string | null; active?: boolean } | null | undefined
  gpsProblem: string
  latitude: string
  longitude: string
  onPlacePin: (latitude: string, longitude: string) => void
}) {
  return (
    <>
      <p className="text-[15px] text-muted-foreground max-lg:hidden">
        <Txt>Use GPS, move a map pin, or enter coordinates.</Txt>
      </p>
      <Card className="space-y-3">
        {/* Side by side while both labels fit on a line; otherwise each takes the full width. */}
        <div className="flex flex-wrap gap-2.5 *:grow *:basis-auto">
          <Button className="lg:h-[52px]" type="button" onClick={() => onLocate()} disabled={locating}>
            {locating ? <LoaderCircle className="animate-spin" /> : <LocateFixed />}
            <Txt>{locating ? 'Finding your location…' : 'Use GPS'}</Txt>
          </Button>
          <Button variant="tinted" className="lg:h-[52px]" type="button" onClick={onToggleMap}>
            <MapIcon />
            <Txt>{showMap ? 'Hide map' : 'Adjust pin on map'}</Txt>
          </Button>
        </div>
        {located && (
          <m.p
            className="flex items-center gap-2 rounded-xl bg-[color-mix(in_oklab,var(--status-resolved)_12%,transparent)] px-3 py-2.5 text-[15px] font-medium text-[var(--status-resolved)]"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <CheckCircle2 className="size-5 shrink-0" />
            <span className="min-w-0">
              <Txt>Location set</Txt> · {streetName ?? coordinates}
              {locationSource && locationSource !== 'manual' && (
                <span className="block text-[13px] font-normal opacity-80">
                  <Txt>
                    {locationSource === 'photo'
                      ? 'From your photo'
                      : locationSource === 'previous'
                        ? 'From your earlier report'
                        : 'From your phone'}
                  </Txt>
                  {streetName && ` · ${coordinates}`}
                </span>
              )}
              {place?.barangay && (
                <span className="block text-[13px] font-normal opacity-80">
                  <Txt>Barangay</Txt> {place.barangay}
                </span>
              )}
            </span>
          </m.p>
        )}
        {!located && gpsProblem && (
          <p
            role="alert"
            className="flex items-start gap-2 rounded-xl bg-[color-mix(in_oklab,var(--status-pending)_14%,transparent)] px-3 py-2.5 text-[14px] text-[var(--status-pending)]"
          >
            <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <Txt>{gpsProblem}</Txt>
          </p>
        )}
        {located && place?.active && !place.barangay && (
          <p
            role="status"
            className="flex items-start gap-2 rounded-xl bg-[color-mix(in_oklab,var(--status-pending)_14%,transparent)] px-3 py-2.5 text-[14px] text-[var(--status-pending)]"
          >
            <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <Txt>
              This pin is outside the area we cover. You can still send it, and an administrator will review it.
            </Txt>
          </p>
        )}
      </Card>
      {showMap && (
        <div className="hairline overflow-hidden rounded-2xl">
          <MapPicker
            latitude={latitude ? Number(latitude) : null}
            longitude={longitude ? Number(longitude) : null}
            onPick={(lat, lng) => onPlacePin(String(lat), String(lng))}
          />
        </div>
      )}
      <details className="group hairline rounded-2xl bg-card">
        <summary className="flex min-h-12 items-center justify-between px-4 text-[16px] font-medium [&::-webkit-details-marker]:hidden">
          <Txt>Enter coordinates manually</Txt>
          <ChevronRight className="size-4 text-muted-foreground transition-transform group-open:rotate-90" />
        </summary>
        <div className="grid grid-cols-2 gap-3 px-4 pb-4">
          <label className="space-y-1.5 text-[14px] font-medium text-muted-foreground">
            <Txt>Latitude</Txt>
            <Input
              type="number"
              inputMode="decimal"
              step="any"
              min="-90"
              max="90"
              value={latitude}
              onChange={event => onPlacePin(event.target.value, longitude)}
              placeholder="14.326900"
              className="text-foreground"
            />
          </label>
          <label className="space-y-1.5 text-[14px] font-medium text-muted-foreground">
            <Txt>Longitude</Txt>
            <Input
              type="number"
              inputMode="decimal"
              step="any"
              min="-180"
              max="180"
              value={longitude}
              onChange={event => onPlacePin(latitude, event.target.value)}
              placeholder="120.936400"
              className="text-foreground"
            />
          </label>
        </div>
      </details>
    </>
  )
}
