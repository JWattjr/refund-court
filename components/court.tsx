"use client";
import { useEffect, useState } from "react";
import {
  ArrowUpRight,
  ArrowRight,
  Check,
  ChevronRight,
  FileCheck2,
  Wallet,
  RefreshCw,
  ShieldCheck,
  Scale,
  Terminal,
  ExternalLink,
  Clock3,
  AlertTriangle,
} from "lucide-react";
import type {
  Proof,
  CourtCase,
  Service,
  Bond,
  TxView,
  Envelope,
} from "@/lib/domain";
import { short } from "@/lib/domain";
import { explorer, basePayment } from "@/lib/explorer";

type Live = {
  services: Service[];
  claimCases: CourtCase[];
  bonds: Record<string, Bond>;
  readAt: string;
};
type Tracked = { hash: string; label: string; view?: TxView };
const STORE = "refund-court-transactions-v1";
function LinkOut({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <a href={href} target="_blank" rel="noreferrer">
      {children}
      <ArrowUpRight size={13} />
    </a>
  );
}
function Badge({ value }: { value: string }) {
  return (
    <span
      className={
        "badge " +
        (value === "REFUND" ||
        value === "PAID" ||
        value === "MET" ||
        value === "FROZEN" ||
        value === "ACTIVE" ||
        value === "FINALIZED_SUCCESS"
          ? "green"
          : value === "NOT_MET" ||
              value === "REJECTED" ||
              value === "FINALIZED_ERROR"
            ? "red"
            : "neutral")
      }
    >
      {value.replaceAll("_", " ")}
    </span>
  );
}
export default function Court({ proof }: { proof: Proof }) {
  const [view, setView] = useState<"recorded" | "live">("recorded"),
    [live, setLive] = useState<Live | null>(null),
    [liveError, setLiveError] = useState(""),
    [reading, setReading] = useState(false);
  const [selected, setSelected] = useState(""),
    [criterion, setCriterion] = useState(0),
    [tab, setTab] = useState<"verdict" | "response" | "receipts">("verdict");
  const [account, setAccount] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [jobs, setJobs] = useState<Tracked[]>([]),
    [restored, setRestored] = useState(false);
  const [mode, setMode] = useState("broken"),
    [city, setCity] = useState("Lagos"),
    [envelope, setEnvelope] = useState<Envelope | null>(null),
    [nonce, setNonce] = useState("");
  const [compileEndpoint, setCompileEndpoint] = useState(""),
    [compileText, setCompileText] = useState(
      "Returns a demo weather report for the requested city, temperature in Celsius, with observed_at no older than one hour before delivered_at.",
    );
  const data = view === "live" ? live : null,
    services = data?.services ?? proof.services ?? [],
    cases = data?.claimCases ?? proof.claimCases ?? [],
    bonds = data?.bonds ?? proof.bonds ?? {};
  const current = cases.find((c) => c.id === selected) ?? cases.at(-1),
    service = services.find((s) => s.id === current?.service_id);
  useEffect(() => {
    try {
      const stored = JSON.parse(
        localStorage.getItem(STORE) ?? "[]",
      ) as Tracked[];
      setJobs(stored.filter((x) => /^0x[\da-f]{64}$/i.test(x.hash)).slice(-20));
      const e = localStorage.getItem("refund-court-evidence");
      if (e) setEnvelope(JSON.parse(e));
      setNonce(localStorage.getItem("refund-court-nonce") ?? "");
    } catch {
      setMessage(
        "Saved browser state could not be restored. Check wallet activity before resubmitting.",
      );
    }
    setRestored(true);
  }, []);
  useEffect(() => {
    if (restored) localStorage.setItem(STORE, JSON.stringify(jobs));
  }, [jobs, restored]);
  useEffect(() => {
    if (!restored) return;
    const controller = new AbortController();
    let running = false;
    const poll = async () => {
      if (running) return;
      running = true;
      try {
        const active = jobs
          .filter((j) => !j.view?.state.startsWith("FINALIZED"))
          .slice(-3);
        for (const job of active) {
          const r = await fetch("/api/transactions/" + job.hash, {
            signal: controller.signal,
          });
          if (!r.ok) continue;
          const v = (await r.json()) as TxView;
          setJobs((old) =>
            old.map((x) => (x.hash === job.hash ? { ...x, view: v } : x)),
          );
        }
      } catch (e) {
        if (!(e instanceof DOMException && e.name === "AbortError"))
          setMessage(
            "Receipt polling is temporarily unavailable. Tracking will retry; do not resubmit.",
          );
      } finally {
        running = false;
      }
    };
    void poll();
    const interval = setInterval(() => void poll(), 15000);
    return () => {
      controller.abort();
      clearInterval(interval);
    };
  }, [
    restored,
    jobs
      .map((j) => j.hash + Boolean(j.view?.state.startsWith("FINALIZED")))
      .join("|"),
  ]);
  async function refresh() {
    setReading(true);
    setLiveError("");
    try {
      const r = await fetch("/api/live");
      const body = await r.json();
      if (!r.ok) throw Error(body.error);
      setLive(body);
      setView("live");
    } catch (e) {
      setLiveError(e instanceof Error ? e.message : "Live chain read failed");
    } finally {
      setReading(false);
    }
  }
  async function act(action: () => Promise<void>) {
    setBusy(true);
    setMessage("");
    try {
      await action();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Action failed");
    } finally {
      setBusy(false);
    }
  }
  function track(hash: string, label: string) {
    setJobs((old) =>
      old.some((x) => x.hash === hash)
        ? old
        : [...old, { hash, label }].slice(-20),
    );
    setMessage("Submitted. The saved hash will keep tracking after reload.");
  }
  async function send(
    method: string,
    args: unknown[],
    label: string,
    value = 0n,
  ) {
    const address = proof.contracts.RefundCourt?.address;
    if (!address) throw Error("RefundCourt is not deployed.");
    const { write } = await import("@/lib/wallet");
    await write(address, method, args, value, (hash) => track(hash, label));
  }
  const paymentCase = (live?.claimCases ?? cases).find(
    (c) => c.payment_hash === envelope?.payment_hash,
  );
  const activeService = services.find(
    (s) => s.status === "FROZEN" && s.endpoint.endsWith("/" + mode),
  );
  const isPending = jobs.some((j) => !j.view?.state.startsWith("FINALIZED"));
  const capture = proof.recordedAt
    ? new Date(proof.recordedAt).toLocaleString()
    : "No cases captured yet";
  return (
    <div className="shell">
      <aside className="sidebar">
        <a href="#" className="brand">
          <span className="brand-mark">
            <Scale size={22} />
          </span>
          <span>
            Refund
            <br />
            Court<span className="brand-period">.</span>
          </span>
        </a>
        <p className="sidebar-description">The promise is the policy.</p>
        <nav aria-label="Main navigation">
          <a href="#cases" className="nav-active">
            <Scale size={18} />
            Case desk
            <ChevronRight size={15} />
          </a>
          <a href="#services">
            <ShieldCheck size={18} />
            Seller promises
          </a>
          <a href="#try">
            <Terminal size={18} />
            Try the buyer agent
          </a>
          <a href="#proof">
            <FileCheck2 size={18} />
            Proof & contracts
          </a>
        </nav>
        <div className="sidebar-note">
          <span className="status-dot" />
          Testnet demonstration
          <p>
            x402 on Base Sepolia
            <br />
            Judgment on GenLayer
          </p>
        </div>
        <div className="sidebar-bottom">
          <LinkOut href="https://internetcourt.org">
            Built for Internet Court
          </LinkOut>
          <p>Payment isn’t proof of delivery.</p>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <span>
            <span className="network-dot" />
            StudioNet <span className="muted">/ 61999</span>
          </span>
          <div className="topbar-actions">
            {proof.github && <LinkOut href={proof.github}>Source code</LinkOut>}
            <button
              className="wallet-button"
              onClick={() =>
                void act(async () => {
                  const { walletAccount } = await import("@/lib/wallet");
                  setAccount((await walletAccount()).account);
                })
              }
            >
              <Wallet size={15} />
              {account ? short(account) : "Connect wallet"}
            </button>
          </div>
        </header>
        <main>
          <section className="intro">
            <div>
              <h1>Chargebacks for agents.</h1>
              <p>
                An agent paid. The API broke its promise.
                <br />
                Independent validators decide who gets the money.
              </p>
            </div>
            <a className="primary" href="#try">
              Run a paid request
              <ArrowRight size={17} />
            </a>
          </section>
          <div className="flow">
            <span>
              <b>x402</b> Agent pays in USDC
            </span>
            <ArrowRight size={15} />
            <span>
              <b>GenLayer</b> Validators judge delivery
            </span>
            <ArrowRight size={15} />
            <span>
              <b>Refund Court</b> Seller bond pays the refund
            </span>
          </div>
          <section id="cases" className="case-section">
            <div className="section-title">
              <h2>The case desk</h2>
              <div className="source-switch" aria-label="Evidence source">
                <button
                  aria-pressed={view === "recorded"}
                  onClick={() => setView("recorded")}
                >
                  Recorded proof
                </button>
                <button
                  aria-pressed={view === "live"}
                  disabled={reading}
                  onClick={() => void refresh()}
                >
                  {reading ? (
                    <RefreshCw size={13} className="spin" />
                  ) : (
                    <span className="live-dot" />
                  )}
                  Live chain reads
                </button>
              </div>
            </div>
            <div className="source-line">
              <span>
                {view === "recorded"
                  ? `Recorded capture · ${capture}`
                  : live
                    ? `Finalized state read · ${new Date(live.readAt).toLocaleString()}`
                    : "Live state has not loaded."}
              </span>
              <span>
                {view === "recorded"
                  ? "Published receipts, not current balances"
                  : "May take up to 45 seconds to refresh"}
              </span>
            </div>
            {liveError && (
              <p className="notice error" role="alert">
                Live reads failed: {liveError}. Recorded proof is still
                available.
              </p>
            )}
            <div className="desk">
              <div className="case-list">
                <div className="list-head">
                  Cases <span>{cases.length}</span>
                </div>
                {cases.length ? (
                  cases.map((c) => (
                    <button
                      key={c.id}
                      className={
                        "case-row " + (current?.id === c.id ? "selected" : "")
                      }
                      onClick={() => {
                        setSelected(c.id);
                        setCriterion(0);
                        setTab("verdict");
                      }}
                    >
                      <div>
                        <span className="case-id">{c.id}</span>
                        <Badge value={c.status} />
                      </div>
                      <strong>
                        {services
                          .find((s) => s.id === c.service_id)
                          ?.endpoint.split("/")
                          .at(-1) === "injection"
                          ? "Prompt injection attempt"
                          : c.status === "DELIVERED"
                            ? "Promise delivered"
                            : c.status === "REFUND"
                              ? "A broken weather promise"
                              : "Delivery under review"}
                      </strong>
                      <span>
                        {short(c.payment_hash)}
                        <ChevronRight size={14} />
                      </span>
                    </button>
                  ))
                ) : (
                  <div className="list-empty">
                    <Clock3 size={22} />
                    <strong>No finalized cases yet</strong>
                    <p>
                      Signed paid requests will appear here after they are filed
                      and recorded.
                    </p>
                  </div>
                )}
                <div className="list-foot">
                  <ShieldCheck size={15} />
                  Every verdict has evidence.
                </div>
              </div>
              <article className="case-detail">
                {current ? (
                  <>
                    <div className="case-detail-head">
                      <div>
                        <span className="case-id">
                          {current.id} · {current.service_id}
                        </span>
                        <h3>
                          {current.status === "REFUND"
                            ? "The promise was broken."
                            : current.status === "DELIVERED"
                              ? "The seller delivered."
                              : current.status === "VOID"
                                ? "No judgment, no chargeback."
                                : "The evidence is before the court."}
                        </h3>
                      </div>
                      <Badge value={current.status} />
                    </div>
                    <p className="promise-text">
                      “{service?.promise ?? "Frozen seller promise"}”
                    </p>
                    <div className="case-facts">
                      <span>
                        Paid via x402<b>0.001 USDC</b>
                      </span>
                      <span>
                        Fixed reimbursement<b>{current.refund_wei} wei GEN</b>
                      </span>
                      <span>
                        Filing fee<b>{current.fee_wei} wei GEN</b>
                      </span>
                      <span>
                        Decision source<b>GenLayer validators</b>
                      </span>
                    </div>
                    <div
                      className="tabs"
                      role="tablist"
                      aria-label="Case evidence"
                    >
                      {(["verdict", "response", "receipts"] as const).map(
                        (t) => (
                          <button
                            role="tab"
                            aria-selected={tab === t}
                            key={t}
                            onClick={() => setTab(t)}
                          >
                            {t === "verdict"
                              ? "Criterion verdicts"
                              : t === "response"
                                ? "Signed evidence"
                                : "Receipts & refund"}
                          </button>
                        ),
                      )}
                    </div>
                    {tab === "verdict" ? (
                      <div className="verdict-pane">
                        {current.verdicts.length ? (
                          current.verdicts.map((v, i) => (
                            <button
                              className={
                                "criterion " + (criterion === i ? "open" : "")
                              }
                              key={i}
                              onClick={() => setCriterion(i)}
                            >
                              <div>
                                <span className="criterion-index">
                                  {String(i + 1).padStart(2, "0")}
                                </span>
                                <strong>{v.criterion}</strong>
                                <Badge value={v.verdict} />
                              </div>
                              {criterion === i && (
                                <blockquote>
                                  <span>Verbatim from the signed response</span>
                                  <code>{v.quote}</code>
                                </blockquote>
                              )}
                            </button>
                          ))
                        ) : (
                          <div className="empty-inline">
                            <Clock3 size={22} />
                            <p>
                              {current.status === "VOID"
                                ? current.reason
                                : "No finalized criterion verdicts. Fund, judge or expire this case using the controls below."}
                            </p>
                          </div>
                        )}
                        <p className="evidence-note">
                          Validators agree on the verdict. Their choice of quote
                          can differ; every quote must appear in the signed
                          body.
                        </p>
                      </div>
                    ) : tab === "response" ? (
                      <div className="payload-pane">
                        <h4>Request · signed bytes</h4>
                        <pre>{current.request}</pre>
                        <h4>Response · untrusted evidence</h4>
                        <pre>{current.response}</pre>
                        <h4>SHA-256 evidence digest</h4>
                        <code className="break">{current.evidence_sha256}</code>
                        <h4>Seller signature · raw digest</h4>
                        <code className="break">{current.signature}</code>
                      </div>
                    ) : (
                      <div className="receipt-pane">
                        <LinkOut href={basePayment(current.payment_hash)}>
                          x402 payment on Base Sepolia
                        </LinkOut>
                        {Object.entries(proof.transactions)
                          .filter(([label]) =>
                            label.includes(
                              service?.endpoint.split("/").at(-1) ?? "__none",
                            ),
                          )
                          .map(([label, hash]) => (
                            <LinkOut key={hash} href={explorer("tx", hash)}>
                              {label}
                            </LinkOut>
                          ))}
                        <p>
                          Native transfers count as paid only after{" "}
                          <code>value_credited: true</code> and{" "}
                          <code>verify_claim</code>. A refund verdict alone is
                          not a completed payout.
                        </p>
                        {Object.entries(proof.credits ?? {}).map(
                          ([owner, credit]) => (
                            <div className="credit-line" key={owner}>
                              <span>{short(owner)}</span>
                              <b>{credit.available_wei} wei available</b>
                              <Badge value={credit.pull.status ?? "NO PULL"} />
                              {credit.pull.child_hash && (
                                <LinkOut
                                  href={explorer("tx", credit.pull.child_hash)}
                                >
                                  Native receipt
                                </LinkOut>
                              )}
                            </div>
                          ),
                        )}
                      </div>
                    )}
                  </>
                ) : (
                  <div className="empty-detail">
                    <div className="empty-mark">
                      <Scale size={40} strokeWidth={1.3} />
                    </div>
                    <h3>
                      A payment can succeed.
                      <br />A promise can still fail.
                    </h3>
                    <p>
                      The court will show each frozen criterion, a validator
                      verdict and a verbatim quote from the seller’s signed
                      response.
                    </p>
                    <a href="#try">
                      Create the first live claim
                      <ArrowRight size={16} />
                    </a>
                    <div className="empty-rule">
                      <span>MET → seller keeps fee</span>
                      <span>NOT MET → bond refunds buyer</span>
                      <span>UNCLEAR → void, fee returned</span>
                    </div>
                  </div>
                )}
              </article>
            </div>
          </section>
          <section id="services">
            <div className="section-title">
              <h2>Promises with something behind them.</h2>
              <span className="muted">
                Frozen terms · fixed refund · seller bond
              </span>
            </div>
            <div className="seller-grid">
              {services.filter((s) => s.status !== "REJECTED").length ? (
                services
                  .filter((s) => s.status !== "REJECTED")
                  .map((s) => (
                    <article className="seller" key={s.id}>
                      <div>
                        <ShieldCheck size={20} />
                        <Badge value={bonds[s.id]?.status ?? s.status} />
                      </div>
                      <h3>
                        {s.endpoint.endsWith("/honest")
                          ? "Honest weather"
                          : s.endpoint.endsWith("/injection")
                            ? "Injection weather"
                            : "Broken weather"}
                      </h3>
                      <p>{s.promise}</p>
                      <ol>
                        {s.criteria.map((c) => (
                          <li key={c}>{c}</li>
                        ))}
                      </ol>
                      <div className="seller-money">
                        <span>
                          Bond <b>{bonds[s.id]?.balance ?? "0"} wei GEN</b>
                        </span>
                        <span>
                          Refund <b>{s.refund_wei} wei GEN</b>
                        </span>
                      </div>
                      <span className="hash-label">
                        Frozen SHA-256{" "}
                        <code title={s.hash}>{short(s.hash)}</code>
                      </span>
                    </article>
                  ))
              ) : (
                <div className="empty-sellers">
                  <ShieldCheck size={22} />
                  <p>
                    No frozen seller promises have been recorded. Compile a
                    promise below, then read finalized state.
                  </p>
                </div>
              )}
            </div>
            {services
              .filter((s) => s.status === "REJECTED")
              .map((s) => (
                <div className="rejection" key={s.id}>
                  <AlertTriangle size={19} />
                  <div>
                    <strong>Rejected at compilation</strong>
                    <p>“{s.promise}”</p>
                    <span>{s.reason}</span>
                  </div>
                  <Badge value="REJECTED" />
                </div>
              ))}
          </section>
          <section id="try" className="try-section">
            <div className="try-description">
              <Terminal size={25} />
              <h2>
                Send the agent.
                <br />
                Keep the receipt.
              </h2>
              <p>
                Buy one signed demo weather report. Choose the honest endpoint
                or put a broken promise in front of the court.
              </p>
              <p className="cost-note">
                0.001 test USDC on Base Sepolia. Filing costs 1 wei GEN. A
                breached promise pays a fixed 5 wei GEN reimbursement. These are
                separate test assets.
              </p>
              <a
                href="https://faucet.circle.com/"
                target="_blank"
                rel="noreferrer"
              >
                Get test USDC
                <ExternalLink size={13} />
              </a>
            </div>
            <div className="agent-workbench">
              <div className="mode-options" aria-label="API behavior">
                {["honest", "broken", "injection"].map((m) => (
                  <button
                    key={m}
                    aria-pressed={mode === m}
                    disabled={busy}
                    onClick={() => setMode(m)}
                  >
                    {m === "honest"
                      ? "Honest"
                      : m === "broken"
                        ? "Broken promise"
                        : "Prompt injection"}
                  </button>
                ))}
              </div>
              <label htmlFor="city">Requested city</label>
              <input
                id="city"
                value={city}
                maxLength={80}
                onChange={(e) => setCity(e.target.value)}
                disabled={busy}
              />
              <p className="endpoint-label">
                <span>GET</span> /api/weather/{mode}?city=
                {encodeURIComponent(city)}
              </p>
              <button
                className="primary"
                disabled={
                  busy ||
                  !activeService ||
                  bonds[activeService?.id ?? ""]?.status !== "ACTIVE" ||
                  Boolean(envelope) ||
                  Boolean(nonce)
                }
                onClick={() =>
                  void act(async () => {
                    const n = crypto.randomUUID();
                    setNonce(n);
                    localStorage.setItem("refund-court-nonce", n);
                    const { buy } = await import("@/lib/wallet");
                    const result = await buy(mode, city, n);
                    setEnvelope(result);
                    localStorage.setItem(
                      "refund-court-evidence",
                      JSON.stringify(result),
                    );
                    setMessage(
                      "Paid and seller-signed. Wait for three Base confirmations, then file this exact evidence.",
                    );
                  })
                }
              >
                {busy
                  ? "Waiting for wallet or network…"
                  : envelope
                    ? "Paid evidence saved"
                    : nonce
                      ? "Reconcile previous request before retrying"
                      : "Pay & run buyer agent"}
                <ArrowRight size={16} />
              </button>
              {!activeService && (
                <p className="help">
                  A finalized, bonded promise is required before this endpoint
                  can be tried.
                </p>
              )}
              {envelope && (
                <div className="saved-evidence">
                  <span>
                    <Check size={15} />
                    Signed evidence saved in this browser
                  </span>
                  <LinkOut href={basePayment(envelope.payment_hash)}>
                    Inspect USDC payment
                  </LinkOut>
                  <button
                    className="secondary"
                    disabled={busy || isPending || Boolean(paymentCase)}
                    onClick={() =>
                      void act(async () => {
                        const endpoint = (
                          JSON.parse(envelope.request) as { endpoint: string }
                        ).endpoint;
                        const s = (live?.services ?? services).find(
                          (x) =>
                            x.endpoint === endpoint && x.status === "FROZEN",
                        );
                        if (!s)
                          throw Error(
                            "Refresh live reads to locate the frozen promise.",
                          );
                        await send(
                          "reserve_claim",
                          [
                            s.id,
                            envelope.payment_hash,
                            envelope.request,
                            envelope.response,
                            envelope.signature,
                          ],
                          "Reserve signed claim",
                        );
                      })
                    }
                  >
                    File signed claim
                  </button>
                  <div className="step-actions">
                    {paymentCase && (
                      <>
                        <Badge value={paymentCase.status} />
                        {paymentCase.status === "RESERVED" && (
                          <button
                            disabled={busy || isPending}
                            onClick={() =>
                              void act(() =>
                                send(
                                  "deposit_fee",
                                  [paymentCase.id],
                                  "Deposit 1 wei filing fee",
                                  1n,
                                ),
                              )
                            }
                          >
                            Post filing fee · 1 wei GEN
                          </button>
                        )}
                        {paymentCase.status === "FUNDED" && (
                          <button
                            disabled={busy || isPending}
                            onClick={() =>
                              void act(() =>
                                send(
                                  "judge_claim",
                                  [paymentCase.id],
                                  "Judge delivery",
                                ),
                              )
                            }
                          >
                            Ask validators to judge
                          </button>
                        )}
                        {[
                          "RESERVING",
                          "RESERVED",
                          "FUNDED",
                          "FEE_PENDING",
                          "JUDGED",
                        ].includes(paymentCase.status) &&
                          Date.now() / 1000 > paymentCase.deadline && (
                            <button
                              disabled={busy || isPending}
                              onClick={() =>
                                void act(() =>
                                  send(
                                    "expire_case",
                                    [paymentCase.id],
                                    "Expire case and refund fee",
                                  ),
                                )
                              }
                            >
                              Expire & return filing fee
                            </button>
                          )}
                      </>
                    )}
                    <button
                      className="text-button"
                      disabled={busy}
                      onClick={() => void refresh()}
                    >
                      Refresh case state
                    </button>
                  </div>
                  <details>
                    <summary>Captured request and response</summary>
                    <pre>{envelope.request}</pre>
                    <pre>{envelope.response}</pre>
                  </details>
                </div>
              )}
              {nonce && (
                <details className="reconcile">
                  <summary>Reconcile or start another request</summary>
                  <p>
                    Request nonce: <code>{nonce}</code>. Check your Base wallet
                    for a USDC payment. A paid request with no captured
                    signature needs seller recovery; don’t pay again for the
                    same request.
                  </p>
                  <button
                    className="secondary"
                    disabled={busy || isPending}
                    onClick={() => {
                      setEnvelope(null);
                      setNonce("");
                      localStorage.removeItem("refund-court-evidence");
                      localStorage.removeItem("refund-court-nonce");
                      setMessage(
                        "Started a new request. Existing signed evidence remains in any filed on-chain case.",
                      );
                    }}
                  >
                    Clear local request after reconciliation
                  </button>
                </details>
              )}
              <details className="seller-tools">
                <summary>Seller tools & native claims</summary>
                <p>
                  Use your own testnet signing endpoint. The demonstration API
                  signs as the dedicated demo seller; registering its URL from
                  another wallet cannot forge that seller’s signature.
                </p>
                <label htmlFor="endpoint">Seller endpoint</label>
                <input
                  id="endpoint"
                  placeholder="https://your-api.example/api/weather/honest"
                  value={compileEndpoint}
                  onChange={(e) => setCompileEndpoint(e.target.value)}
                />
                <label htmlFor="promise">Promise in plain English</label>
                <textarea
                  id="promise"
                  value={compileText}
                  onChange={(e) => setCompileText(e.target.value)}
                  rows={3}
                />
                <button
                  disabled={busy || isPending || !compileEndpoint}
                  onClick={() =>
                    void act(async () => {
                      const { write } = await import("@/lib/wallet");
                      await write(
                        proof.contracts.ServicePromise.address,
                        "register",
                        [compileEndpoint, compileText, 1000, 5],
                        0n,
                        (h) => track(h, "Compile seller promise"),
                      );
                    })
                  }
                >
                  Compile & freeze promise
                </button>
                {services
                  .filter((s) => s.seller === account && s.status === "FROZEN")
                  .map((s) => (
                    <div className="seller-control" key={s.id}>
                      <strong>{s.id}</strong>
                      {!bonds[s.id]?.status && (
                        <button
                          disabled={busy || isPending}
                          onClick={() =>
                            void act(() =>
                              send("prepare_bond", [s.id], "Prepare bond"),
                            )
                          }
                        >
                          Prepare bond
                        </button>
                      )}
                      {bonds[s.id]?.status === "PREPARED" && (
                        <button
                          disabled={busy || isPending}
                          onClick={() =>
                            void act(() =>
                              send(
                                "deposit_bond",
                                [s.id],
                                "Post 20 wei bond",
                                20n,
                              ),
                            )
                          }
                        >
                          Post bond · 20 wei GEN
                        </button>
                      )}
                      {bonds[s.id]?.status === "ACTIVE" && (
                        <button
                          disabled={busy || isPending}
                          onClick={() =>
                            void act(() =>
                              send(
                                "request_withdrawal",
                                [s.id],
                                "Start bond cooldown",
                              ),
                            )
                          }
                        >
                          Start 24h withdrawal cooldown
                        </button>
                      )}
                      {bonds[s.id]?.status === "COOLDOWN" && (
                        <button
                          disabled={
                            busy ||
                            isPending ||
                            Date.now() / 1000 <
                              (bonds[s.id].withdraw_after ?? Infinity)
                          }
                          onClick={() =>
                            void act(() =>
                              send(
                                "finish_withdrawal",
                                [s.id],
                                "Release seller bond to credit",
                              ),
                            )
                          }
                        >
                          Release cooled bond
                        </button>
                      )}
                    </div>
                  ))}
                <button
                  disabled={busy || isPending || !account}
                  onClick={() =>
                    void act(async () => {
                      const r = await fetch("/api/credit/" + account);
                      const c = await r.json();
                      if (!r.ok) throw Error(c.error);
                      await send(
                        "claim",
                        [(c.pull?.attempt ?? 0) + 1],
                        "Claim native GEN credit",
                      );
                    })
                  }
                >
                  Claim available GEN credit
                </button>
                <p>
                  After the native child finalizes, verify the reserved pull
                  with the two hashes.
                </p>
                <PullVerification
                  disabled={busy || isPending || !account}
                  submit={(attempt, parent, child) =>
                    void act(() =>
                      send(
                        "verify_claim",
                        [account, attempt, parent, child],
                        "Verify native credit",
                      ),
                    )
                  }
                />
              </details>
            </div>
          </section>
          {(message || jobs.length > 0) && (
            <section className="activity" aria-label="Transaction tracking">
              <div className="section-title">
                <h2>Wallet activity</h2>
                <span className="muted">Saved here across reloads</span>
              </div>
              {message && (
                <p className="notice" role="status">
                  {message}
                </p>
              )}
              {jobs
                .slice()
                .reverse()
                .map((j) => (
                  <div className="transaction" key={j.hash}>
                    <div>
                      <strong>{j.label}</strong>
                      <LinkOut href={explorer("tx", j.hash)}>
                        {short(j.hash)}
                      </LinkOut>
                    </div>
                    <Badge value={j.view?.state ?? "SUBMITTED"} />
                    {j.view?.appealDeadline && (
                      <span>
                        Appeal window until{" "}
                        {new Date(
                          j.view.appealDeadline * 1000,
                        ).toLocaleTimeString()}
                      </span>
                    )}
                    {j.view?.error && <p className="error">{j.view.error}</p>}
                    {j.view?.children.map((h) => (
                      <LinkOut key={h} href={explorer("tx", h)}>
                        Finalization / native child {short(h)}
                      </LinkOut>
                    ))}
                  </div>
                ))}
              <p className="help">
                Accepted transactions can still be appealed. Finalized success
                confirms execution; native refunds additionally require a
                credited transfer and verify_claim.
              </p>
            </section>
          )}
          <section id="proof" className="proof-section">
            <div>
              <h2>
                Follow the money.
                <br />
                Inspect the judgment.
              </h2>
              <p>
                The proof manifest records real chain receipts. The verifier
                fails until every required live case and native credit is
                proven.
              </p>
              <code>npm run verify:proof</code>
            </div>
            <div className="contract-links">
              {Object.entries(proof.contracts).map(([name, c]) => (
                <div key={name}>
                  <span>{name}</span>
                  <LinkOut href={explorer("address", c.address)}>
                    {short(c.address)}
                  </LinkOut>
                </div>
              ))}
              {proof.probeContract && (
                <div>
                  <span>Base RPC probe</span>
                  <LinkOut href={explorer("address", proof.probeContract)}>
                    {short(proof.probeContract)}
                  </LinkOut>
                </div>
              )}
              <a href="/proof.json" target="_blank" rel="noreferrer">
                Download recorded proof
                <ArrowUpRight size={15} />
              </a>
              <span className="release-status">
                Release: {proof.releaseStatus.replaceAll("_", " ")}
              </span>
            </div>
          </section>
          <footer>
            <span>Refund Court</span>
            <p>
              Testnet assets. Fixed reimbursement, no exchange-rate conversion.
              The original USDC payment stays on Base.
            </p>
          </footer>
        </main>
      </div>
    </div>
  );
}
function PullVerification({
  disabled,
  submit,
}: {
  disabled: boolean;
  submit: (attempt: number, parent: string, child: string) => void;
}) {
  const [attempt, setAttempt] = useState(1),
    [parent, setParent] = useState(""),
    [child, setChild] = useState("");
  return (
    <div className="pull-form">
      <label>
        Claim attempt
        <input
          type="number"
          min={1}
          value={attempt}
          onChange={(e) => setAttempt(Number(e.target.value))}
        />
      </label>
      <label>
        Parent claim transaction
        <input
          value={parent}
          onChange={(e) => setParent(e.target.value)}
          placeholder="0x…"
        />
      </label>
      <label>
        Native child transaction
        <input
          value={child}
          onChange={(e) => setChild(e.target.value)}
          placeholder="0x…"
        />
      </label>
      <button
        disabled={
          disabled ||
          !/^0x[\da-f]{64}$/i.test(parent) ||
          !/^0x[\da-f]{64}$/i.test(child)
        }
        onClick={() => submit(attempt, parent, child)}
      >
        Verify native credit
      </button>
    </div>
  );
}
