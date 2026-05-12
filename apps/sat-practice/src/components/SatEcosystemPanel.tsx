import { ArrowUpRight } from 'lucide-react';
import { SAT_SIMULATOR_URL } from '../lib/constants';

export const SatEcosystemPanel = (props: { focusDomain?: string; difficulty?: string }) => {
  const url = new URL('/dashboard', SAT_SIMULATOR_URL);
  if (props.focusDomain) url.searchParams.set('focus_domain', props.focusDomain);
  if (props.difficulty) url.searchParams.set('difficulty', props.difficulty);

  return (
    <section className="panel ecosystem-panel">
      <div>
        <p className="eyebrow">SAT ecosystem</p>
        <h2>Use the simulator for checkpoints, then return here for repair.</h2>
        <p>Full mocks stay at sat.schood.online. Practice Lab handles the daily loop between those mocks.</p>
      </div>
      <a className="btn ghost" href={url.toString()}>
        Open simulator
        <ArrowUpRight size={17} />
      </a>
    </section>
  );
};
