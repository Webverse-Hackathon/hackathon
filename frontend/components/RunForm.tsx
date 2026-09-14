'use client';

import type { ServerConfig } from '@ally/shared';
import { useRouter } from 'next/navigation';
import { useEffect, useId, useState, type FormEvent } from 'react';
import { api, ApiRequestError } from '@/lib/api';

const PRESET_GOALS = ['complete checkout', 'add a shirt to the cart', 'subscribe to the newsletter'];

export function RunForm() {
  const router = useRouter();
  const [config, setConfig] = useState<ServerConfig | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [url, setUrl] = useState('http://localhost:3100');
  const [goal, setGoal] = useState('complete checkout');
  const [budget, setBudget] = useState(20);
  const [error, setError] = useState<{ message: string; field?: 'url' | 'goal' } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const ids = { url: useId(), goal: useId(), budget: useId(), error: useId(), goalHint: useId() };

  useEffect(() => {
    api
      .config()
      .then((value) => {
        setConfig(value);
        setUrl(value.connectedSiteUrl);
      })
      .catch((reason: unknown) => setServerError(reason instanceof ApiRequestError ? reason.message : 'The Ally server is not reachable.'));
  }, []);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    if (goal.trim().length < 3) {
      setError({ message: 'Describe the goal in at least three characters, as an outcome such as “complete checkout”.', field: 'goal' });
      return;
    }
    setSubmitting(true);
    try {
      const created = await api.createRun({ url: url.trim(), goal: goal.trim(), stepBudget: budget });
      router.push(created.liveUrl);
    } catch (reason) {
      const message = reason instanceof ApiRequestError ? reason.message : 'The run could not start.';
      const field = reason instanceof ApiRequestError && reason.code === 'INVALID_URL' ? 'url' : undefined;
      setError({ message, field });
      setSubmitting(false);
    }
  };

  const modelMissing = config !== null && !config.modelConfigured;

  return (
    <form className="card run-form" onSubmit={submit} noValidate aria-describedby={error ? ids.error : undefined}>
      <h2 className="run-form-title">
        <span>TEST A TASK</span>
        <span className="badge badge-progress" style={{ fontSize: '0.75rem' }}>SIMULATION</span>
      </h2>

      <div className="field">
        <label htmlFor={ids.url}>Website address</label>
        <input
          id={ids.url}
          name="url"
          type="url"
          inputMode="url"
          autoComplete="url"
          required
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          aria-invalid={error?.field === 'url' || undefined}
          aria-describedby={error?.field === 'url' ? ids.error : undefined}
        />
      </div>

      <div className="field">
        <label htmlFor={ids.goal}>Goal</label>
        <input
          id={ids.goal}
          name="goal"
          required
          minLength={3}
          maxLength={200}
          value={goal}
          onChange={(event) => setGoal(event.target.value)}
          aria-invalid={error?.field === 'goal' || undefined}
          aria-describedby={[ids.goalHint, error?.field === 'goal' ? ids.error : ''].filter(Boolean).join(' ')}
        />
        <p id={ids.goalHint} className="hint">
          An outcome in plain English, not instructions. The agent works out the keystrokes.
        </p>
        <div className="presets" role="group" aria-label="Example goals">
          {PRESET_GOALS.map((preset) => (
            <button key={preset} type="button" className="chip-button" aria-pressed={goal === preset} onClick={() => setGoal(preset)}>
              {preset}
            </button>
          ))}
        </div>
      </div>

      <div className="field field-inline">
        <label htmlFor={ids.budget}>Step budget</label>
        <select id={ids.budget} value={budget} onChange={(event) => setBudget(Number(event.target.value))}>
          {[12, 20, 30, 40].map((value) => (
            <option key={value} value={value}>
              {value} steps
            </option>
          ))}
        </select>
      </div>

      {error ? (
        <p id={ids.error} className="notice notice-bad" role="alert">
          {error.message}
        </p>
      ) : null}
      {serverError ? (
        <p className="notice notice-warn" role="alert">
          {serverError}
        </p>
      ) : null}
      {modelMissing ? (
        <p className="notice notice-warn" role="alert">
          The server has no model key configured, so runs cannot start. Set <code>ANTHROPIC_API_KEY</code> in <code>.env</code> and restart the API.
        </p>
      ) : null}

      <button type="submit" className="button button-large" disabled={submitting || modelMissing || serverError !== null}>
        {submitting ? 'STARTING SIMULATION…' : 'RUN THE AGENT →'}
      </button>
      {config ? (
        <p className="small muted form-footnote">
          Decides with <code>{config.decideModel}</code>, narrates with <code>{config.narrateModel}</code>.{' '}
          {config.pullRequestsEnabled ? `Fixes open pull requests on ${config.pullRequestRepo}.` : 'Fixes are validated and re-run locally.'}
        </p>
      ) : null}
    </form>
  );
}
