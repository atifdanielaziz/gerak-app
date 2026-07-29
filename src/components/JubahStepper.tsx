import React from 'react';

interface JubahStepperProps {
  steps: string[];
  curStep: number;
  labels: Record<string, string>;
  /** admin/rider views use the app's red primary; TrackJubah (customer) uses blue. */
  color?: 'primary' | 'blue';
  labelWeight?: 'semibold' | 'normal';
}

// Was duplicated near-identically in RiderHome.tsx, TrackJubah.tsx, and
// JubahCustomerSubTab.tsx — each with the same layout bug: the circle row
// positions circles via fixed w-5 widths + flex-growing connector lines,
// but the label row below it was a SEPARATE flex row splitting into N equal
// `flex-1 text-center` columns — different layout math, so labels drifted
// out from under their circles (worst for the middle steps; the first/last
// happened to look closer to right since text-left/text-right anchor them
// to the true edges). Fixed here by making each label an absolutely-
// positioned child of its own circle's wrapper, so it's centered directly
// under that specific circle by construction, immune to how wide the text
// is or how the connector lines stretch.
export function JubahStepper({ steps, curStep, labels, color = 'primary', labelWeight = 'semibold' }: JubahStepperProps) {
  const activeBg     = color === 'primary' ? 'bg-primary border-primary' : 'bg-blue-500 border-blue-500';
  const currentBorder = color === 'primary' ? 'border-primary text-primary' : 'border-blue-500 text-blue-500';
  const lineActive   = color === 'primary' ? 'bg-primary' : 'bg-blue-500';

  return (
    <div className="pb-4">
      <div className="flex items-center gap-1">
        {steps.map((step, i) => (
          <React.Fragment key={step}>
            <div className="relative shrink-0">
              <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-semibold border-2 transition ${
                i < curStep   ? `${activeBg} text-white` :
                i === curStep ? `bg-white ${currentBorder}` :
                'bg-white border-slate-200 text-slate-300'
              }`}>
                {i < curStep ? '✓' : i + 1}
              </div>
              <span className={`absolute top-full mt-1 left-1/2 -translate-x-1/2 text-[8px] text-slate-400 whitespace-nowrap ${labelWeight === 'semibold' ? 'font-semibold' : 'font-normal'}`}>
                {labels[step]}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div className={`flex-1 h-0.5 rounded-full transition ${i < curStep ? lineActive : 'bg-slate-200'}`} />
            )}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}
