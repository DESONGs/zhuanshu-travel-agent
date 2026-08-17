import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AppleLogo, ArrowsClockwise, Brain, CheckCircle, CircleNotch, CloudSun, Compass, CurrencyCircleDollar, ForkKnife, GoogleLogo,
  Heart, House, MapPin, MapTrifold, NavigationArrow, PaperPlaneRight, PersonSimpleWalk, Plus, QrCode, SignOut, Sparkle, Train,
  WarningCircle, WechatLogo,
} from "@phosphor-icons/react";
import { api } from "./api-client.js";

const DOMAIN_ITEMS = [
  { key: "play", label: "玩", icon: Compass },
  { key: "food", label: "吃", icon: ForkKnife },
  { key: "stay", label: "住", icon: House },
  { key: "transport", label: "行", icon: Train },
];
const PROMPTS = [
  "国庆和父母去大理 5 天，轻松一点，住得方便，想吃本地菜。",
  "第一次来上海 3 天，想兼顾建筑、咖啡和适合步行的路线。",
  "两个人去北京看秋色，预算 8000，交通尽量少换乘。",
];
const SESSION_PROVIDER_LABELS = { google: "Google", wechat: "微信", alipay: "支付宝", apple: "Apple", email_otp: "本地体验" };

function formatTime(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "刚刚" : new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit" }).format(date);
}

function formatCheckedAt(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "核验时间未知";
  return `${new Intl.DateTimeFormat("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(date)} 核验`;
}

function messageError(error) {
  const messages = {
    authentication_required: "登录会话已失效，请重新登录。",
    conversation_access_denied: "你没有访问这段旅行对话的权限。",
    sensitive_conversation_input_blocked: "为保护隐私，请不要发送证件号、支付卡号、Cookie、Token 或密码。只需描述相关的可操作性要求即可。",
    empty_conversation_message: "先写下这趟旅行的想法。",
  };
  return messages[error.code] ?? "这次没有处理完成，请稍后重试。你的旅行内容不会丢失。";
}

const LOGIN_PROVIDERS = [
  { id: "google", label: "使用 Google 继续", shortLabel: "Google", icon: GoogleLogo, primary: true },
  { id: "wechat", label: "微信扫码登录", shortLabel: "微信", icon: WechatLogo, qr: true },
  { id: "alipay", label: "支付宝扫码登录", shortLabel: "支付宝", icon: QrCode, qr: true },
  { id: "apple", label: "使用 Apple 登录", shortLabel: "Apple", icon: AppleLogo },
];

function authFeedback(code) {
  const messages = {
    auth_authorization_denied: "你取消了登录，没有创建账号会话。",
    auth_state_invalid: "登录校验已失效，请重新选择登录方式。",
    auth_state_expired: "登录页面停留时间较长，请重新登录。",
    auth_provider_not_configured: "这个登录渠道暂未开放，请选择其他方式。",
    auth_provider_unavailable: "登录平台暂时无法连接，请稍后重试。",
    auth_login_failed: "这次登录没有完成，请重新尝试。",
  };
  return code ? messages[code] ?? messages.auth_login_failed : null;
}

function LoginScreen({ onSession, developmentAuthEnabled, providerStatus, initialError }) {
  const [identity, setIdentity] = useState("");
  const [status, setStatus] = useState(initialError ? { error: authFeedback(initialError) } : null);
  const availableById = new Map((providerStatus?.providers ?? []).map((provider) => [provider.id, provider]));
  const webLoginAvailable = LOGIN_PROVIDERS.some((provider) => availableById.get(provider.id)?.available);
  const startLogin = (provider) => {
    if (!availableById.get(provider.id)?.available) return;
    window.location.assign(api.authStartUrl(provider.id));
  };
  const submit = async (event) => {
    event.preventDefault();
    setStatus({ loading: true });
    try {
      onSession(await api.createDevelopmentSession("email_otp", identity.trim() || "local-traveler"));
    } catch (error) {
      setStatus({ error: error.code === "auth_provider_not_configured" ? "生产登录尚未配置。本地开发环境需要显式开启开发会话。" : "无法创建会话，请检查服务配置。" });
    }
  };
  return <main className="auth-shell">
    <section className="auth-visual" aria-hidden="true"><img src="/assets/login-travelers-waterfront.png" alt="" /></section>
    <section className="auth-panel">
      <div className="brand"><MapPin weight="fill" /> Travel Agent</div>
      <h1>把一趟旅行，<br />从一句话开始。</h1>
      <p>告诉旅行 Agent 目的地、时间、同行人或一句模糊的期待；它会先理解，再联动研究吃、住、行、玩。</p>
      <section className="auth-options" aria-label="选择登录方式">
        {status?.error && <p className="form-error" role="alert"><WarningCircle /> {status.error}</p>}
        {LOGIN_PROVIDERS.filter((provider) => provider.primary).map((provider) => {
          const Icon = provider.icon;
          const available = availableById.get(provider.id)?.available === true;
          return <button key={provider.id} className="auth-provider primary-provider" onClick={() => startLogin(provider)} disabled={!available}><Icon weight="bold" /><span>{provider.label}</span>{!available && <em>待开放</em>}</button>;
        })}
        <div className="auth-provider-grid">{LOGIN_PROVIDERS.filter((provider) => !provider.primary).map((provider) => {
          const Icon = provider.icon;
          const available = availableById.get(provider.id)?.available === true;
          return <button key={provider.id} className={`auth-provider ${provider.id}`} onClick={() => startLogin(provider)} disabled={!available}><Icon weight={provider.id === "wechat" ? "fill" : "regular"} /><span>{provider.shortLabel}</span>{!available && <em>待开放</em>}</button>;
        })}</div>
        <p className="qr-guidance">电脑端选择微信或支付宝后，会进入平台官方扫码页；手机端按平台授权流程继续。</p>
        {!webLoginAvailable && !developmentAuthEnabled ? <div className="auth-unavailable"><WarningCircle weight="fill" /><div><strong>登录渠道正在配置</strong><p>当前没有可用的登录方式，请稍后再试。</p></div></div> : null}
      </section>
      {developmentAuthEnabled ? <form className="development-login" onSubmit={submit}>
        <div className="auth-divider"><span>本地开发</span></div>
        <div className="local-mode"><strong>仅限本机体验</strong><span>不会发送验证码，也不会冒充任何第三方账号。</span></div>
        <label>怎么称呼你<input value={identity} onChange={(event) => setIdentity(event.target.value)} maxLength={80} placeholder="旅行者" /></label>
        <button className="button primary" disabled={status?.loading}>{status?.loading ? <CircleNotch className="spin" /> : null}进入旅行助手</button>
      </form> : null}
      <small>支付、证件、Cookie 与第三方账号凭据不会发送给旅行 Agent。预订只会准备跳转，不会替你购买或退改。</small>
    </section>
  </main>;
}

function MessageBody({ text }) {
  const lines = String(text ?? "").split(/\n+/).filter((line, index, values) => line.trim() || (index > 0 && index < values.length - 1));
  return <div className="message-body">{lines.map((line, index) => {
    const pieces = line.split(/(\*\*[^*]+\*\*)/g).filter(Boolean);
    return <span key={`${line}-${index}`} className="message-line">{pieces.map((piece, pieceIndex) => piece.startsWith("**") && piece.endsWith("**") ? <strong key={pieceIndex}>{piece.slice(2, -2)}</strong> : piece)}</span>;
  })}</div>;
}

function MessageBubble({ message, modelLabel }) {
  if (message.role === "status") return <div className="conversation-status"><WarningCircle weight="fill" /><span>{message.text}</span></div>;
  return <article className={`chat-message ${message.role}`}>
    <div className="message-avatar" aria-hidden="true">{message.role === "user" ? "你" : <Sparkle weight="fill" />}</div>
    <div className="message-copy"><MessageBody text={message.text} /><time>{message.role === "user" ? "你的需求" : `Travel Agent${modelLabel ? ` · ${modelLabel}` : ""}`} · {formatTime(message.createdAt)}</time></div>
  </article>;
}

function ThinkingMessage() {
  return <article className="chat-message assistant typing" aria-live="polite" aria-label="旅行助手正在理解需求并核验资料"><div className="message-avatar"><Sparkle weight="fill" /></div><div className="thinking-state"><div className="typing-dots"><i /><i /><i /></div><small>正在理解约束并核验真实资料，复杂行程通常需要 10–30 秒</small></div></article>;
}

function ConversationIntro({ onPrompt }) {
  return <section className="conversation-intro">
    <div className="intro-mark"><Sparkle weight="fill" /></div>
    <span className="eyebrow">旅行编辑</span>
    <h1>先告诉我你想怎么旅行。</h1>
    <p>不需要先填行程表。说目的地、日期、同行人，或者只说“想找一个周末逃离城市的地方”也可以。</p>
    <div className="prompt-suggestions">{PROMPTS.map((prompt) => <button key={prompt} onClick={() => onPrompt(prompt)}>{prompt}</button>)}</div>
  </section>;
}

function Composer({ value, onChange, onSubmit, loading, modelOptions, modelId, defaultModelId, onModelChange }) {
  const inputRef = useRef(null);
  const activeModel = modelOptions.find((option) => option.id === modelId);
  return <form className="chat-composer" onSubmit={(event) => { event.preventDefault(); onSubmit(value); }}>
    <textarea ref={inputRef} value={value} onChange={(event) => onChange(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); onSubmit(value); } }} rows={1} maxLength={4_000} placeholder="例如：国庆和父母去大理 5 天，轻松一点，住得方便，想吃本地菜。" />
    <div className="composer-footer">
      {modelOptions.length ? <label className="model-picker" title={activeModel?.description}><Brain weight="duotone" /><span className="visually-hidden">思考模型</span><select value={modelId} onChange={(event) => onModelChange(event.target.value)} disabled={loading} aria-label="选择这段旅行对话使用的思考模型">{modelOptions.map((option) => <option key={option.id} value={option.id} disabled={!option.available}>{option.shortLabel}{option.id === defaultModelId ? " · 默认" : ""}{!option.available ? " · 未配置" : ""}</option>)}</select></label> : null}
      <span className="composer-privacy">不要发送证件、支付或账号凭据</span>
      <button className="send-button" aria-label="发送旅行需求" disabled={loading || !value.trim()}>{loading ? <CircleNotch className="spin" /> : <PaperPlaneRight weight="fill" />}</button>
    </div>
  </form>;
}

function ActivityStrip({ activities }) {
  if (!activities?.length) return null;
  const labels = { save_trip_understanding: "已记住旅行要求", research_trip_options: "正在查找吃住行玩", get_trip_control_view: "已读取旅行要求", get_trip_plan_view: "已读取当前方案", accept_trip_change: "已确认方案", refresh_trip_mobility: "已核验城市内移动", reject_trip_change: "已放弃候选" };
  return <div className="activity-strip" aria-live="polite" aria-label="本轮处理进度">{activities.map((activity, index) => <span key={`${activity.toolName}-${index}`} className={["provider_unavailable", "AUTH_REQUIRED", "ACCOUNT_LIMITED", "RATE_LIMITED", "SOURCE_UNAVAILABLE", "EMPTY_VERIFIED"].includes(activity.status) ? "warning" : ""}>{activity.toolName === "research_trip_options" && ["provider_unavailable", "AUTH_REQUIRED", "SOURCE_UNAVAILABLE"].includes(activity.status) ? "没有取得实时地点资料" : activity.toolName === "research_trip_options" && activity.status === "ACCOUNT_LIMITED" ? "地图资料账号当前被平台阻止访问" : activity.toolName === "research_trip_options" && activity.status === "RATE_LIMITED" ? "实时资料请求较多，请稍后再试" : activity.toolName === "research_trip_options" && activity.status === "EMPTY_VERIFIED" ? "暂未找到可靠地点资料" : activity.toolName === "refresh_trip_mobility" && activity.status === "provider_unavailable" ? "城市路线资料暂不可用" : activity.toolName === "refresh_trip_mobility" && activity.status === "needs_context" ? "确认更多地点后再核验路线" : `${labels[activity.toolName] ?? "正在处理旅行要求"}${activity.status === "proposed" ? "，请在右侧比较" : ""}`}</span>)}</div>;
}

function CandidatePhoto({ candidate }) {
  const photo = candidate.media?.[0];
  return photo ? <img className="candidate-photo" src={photo.url} alt={photo.title || `${candidate.title}实景图`} loading="lazy" referrerPolicy="no-referrer" /> : null;
}

function mappedFacilityLabels(detail) {
  return (detail?.mappedFacilities ?? []).map((facility) => facility.label).filter(Boolean);
}

function acceptedSourceLabel(item) {
  if (item.sourceStatus === "user_input") return "由你提供，仍待核验";
  if (item.operability?.inventoryVerified === false && item.operability?.bookingProviderLabel) {
    if (item.domain === "stay") return "酒店资料已查询；房态、房型和退改待跳转核验";
    if (item.domain === "transport") return "班次与参考价已查询；余位和退改待跳转核验";
    return "体验资料已查询；票价和库存待跳转核验";
  }
  return item.sourceStatus === "verified_provider" ? "来源资料已核验" : "来源待核验";
}

function ProposalPanel({ proposal, selections, onSelect, onAccept, onReject, loading }) {
  return <section className="proposal-panel" aria-labelledby={`proposal-${proposal.proposalId}`}>
    <header className="proposal-heading"><div><span className="proposal-state"><Sparkle weight="fill" />待你比较</span><h3 id={`proposal-${proposal.proposalId}`}>{proposal.title}</h3><p>{proposal.summary}</p></div><div className="proposal-source"><strong>{proposal.providerLabel ?? "实时地点资料"}</strong><span>{formatCheckedAt(proposal.checkedAt)}</span></div></header>
    <div className="proposal-domains">{DOMAIN_ITEMS.map(({ key, label, icon: Icon }) => {
      const candidates = proposal.byDomain?.[key] ?? [];
      return <section className="proposal-domain" key={key} aria-labelledby={`${proposal.proposalId}-${key}`}>
        <div className="domain-title"><span><Icon weight="duotone" /></span><div><h4 id={`${proposal.proposalId}-${key}`}>{label}</h4><small>{candidates.length ? `${candidates.length} 个可选` : "暂无已核验候选"}</small></div></div>
        <div className="candidate-list">{candidates.map((candidate) => {
          const detail = candidate.operability ?? {};
          const locationLabel = candidate.location?.district || candidate.location?.label;
          const facilities = mappedFacilityLabels(detail);
          return <article key={candidate.nodeId} className={`candidate-option ${candidate.media?.[0] ? "has-photo" : "no-photo"} ${selections[key] === candidate.nodeId ? "selected" : ""}`}>
            <label><input type="radio" name={`${proposal.proposalId}-${key}`} checked={selections[key] === candidate.nodeId} onChange={() => onSelect(key, candidate.nodeId)} /><CandidatePhoto candidate={candidate} /><span className="radio-mark" aria-hidden="true" /><span className="candidate-copy"><strong>{candidate.title}</strong><span>{candidate.summary || "地点详情仍待补充核验。"}</span><small>{[locationLabel, detail.rating ? `评分 ${detail.rating}` : null, detail.priceHint ? `参考消费 ${detail.priceHint}` : null, detail.weatherFit === "preferred" ? "天气优先" : detail.weatherFit === "caution" ? "天气需备选" : null].filter(Boolean).join(" · ")}</small>{facilities.length ? <em>地图资料：{facilities.join("、")} · 非实时，现场确认</em> : null}{key === "stay" && detail.lodgingDataNature === "amap_place_reference" ? <em>高德提供酒店位置与基础资料；指定日期房态、房型和价格仍待 OTA 核验</em> : key === "stay" && detail.inventoryVerified === false ? <em>酒店参考候选；指定日期房态、房型、早餐、退改和外宾资格需在 OTA 跳转页核验</em> : null}</span></label>
            <div className="candidate-links">
              {detail.navigationUrl && <a href={detail.navigationUrl} target="_blank" rel="noreferrer"><NavigationArrow />在高德查看</a>}
              {detail.bookingUrl && <a href={detail.bookingUrl} target="_blank" rel="noreferrer"><NavigationArrow />在{detail.bookingProviderLabel || "供应方"}查看</a>}
            </div>
          </article>;
        })}{!candidates.length && <p className="domain-empty">这一类暂时没有可靠候选，先保持待安排。</p>}</div>
      </section>;
    })}</div>
    <div className="proposal-notes">{proposal.caveats?.map((note) => <span key={note}><WarningCircle />{note}</span>)}</div>
    <footer className="proposal-actions"><button className="quiet-action" onClick={() => onReject(proposal.proposalId)} disabled={loading}>暂不采用</button><button className="button primary" onClick={() => onAccept(proposal.proposalId, selections)} disabled={loading || DOMAIN_ITEMS.some(({ key }) => (proposal.byDomain?.[key]?.length ?? 0) > 0 && !selections[key])}>{loading ? <CircleNotch className="spin" /> : <CheckCircle weight="fill" />}确认所选方案</button></footer>
  </section>;
}

function TripMapPreview({ tripId, plan }) {
  const [hidden, setHidden] = useState(false);
  if (!tripId || !plan?.mapPreviewAvailable || hidden) return null;
  const hasRoutes = (plan?.mobility?.legs?.length ?? 0) > 0;
  return <figure className="trip-map-preview"><img src={api.mapUrl(tripId)} alt={hasRoutes ? "这趟旅行已核验移动路线的地图" : "这趟旅行候选地点的地图分布"} onError={() => setHidden(true)} /><figcaption><MapTrifold weight="duotone" /><span><strong>{hasRoutes ? "地点与移动路线" : "地点分布"}</strong>{hasRoutes ? "蓝色折线是当前推荐移动方式的路线估算。" : "地图只显示当前候选，确认前可继续比较。"}</span></figcaption></figure>;
}

function WeatherPlanningCard({ weather }) {
  if (!weather) return <section className="weather-card pending"><CloudSun weight="duotone" /><div><strong>天气待核验</strong><p>生成方案时会先核验旅行日期与目的地天气，再安排户外体验、换乘缓冲、住宿和餐饮动线。</p></div></section>;
  const coverageLabel = weather.coverage === "covered" ? "覆盖旅行日期" : weather.coverage === "partial" ? "覆盖部分日期" : weather.coverage === "outside_forecast_window" ? "尚未进入预报期" : "旅行日期待明确";
  const title = weather.planningImpact?.active
    ? "天气正在影响这版方案"
    : weather.coverage === "outside_forecast_window"
      ? "还没到可预报范围"
      : weather.coverage === "dates_unknown"
        ? "日期明确后核验天气"
        : "当前预报无需调整方案";
  const tripDates = new Set(weather.tripDates ?? []);
  const days = ["covered", "partial"].includes(weather.coverage)
    ? (weather.forecastDays ?? []).filter((day) => tripDates.has(day.date)).slice(0, 4)
    : [];
  return <section className={`weather-card ${weather.planningImpact?.severity ?? "none"}`}>
    <header><span><CloudSun weight="duotone" /></span><div><strong>{title}</strong><p>{weather.city || weather.destination} · {coverageLabel}{weather.reportTime ? ` · ${weather.reportTime} 发布` : ""}</p></div></header>
    {days.length ? <div className="weather-days">{days.map((day) => <div key={day.date}><small>{day.date.slice(5).replace("-", "/")}</small><strong>{day.dayCondition || "天气待定"}</strong><span>{day.highC ?? "–"}° / {day.lowC ?? "–"}°</span></div>)}</div> : null}
    {weather.planningImpact?.active ? <div className="weather-guidance">{DOMAIN_ITEMS.map(({ key, label }) => weather.planningImpact.guidance?.[key] ? <p key={key}><strong>{label}</strong>{weather.planningImpact.guidance[key]}</p> : null)}</div> : weather.caveat ? <p className="weather-caveat">{weather.caveat}</p> : null}
    <footer><a href={weather.sourceDocumentation} target="_blank" rel="noreferrer">{weather.attribution || (weather.provider === "amap_weather" ? "高德天气" : "天气来源")} · {formatCheckedAt(weather.checkedAt)}</a></footer>
  </section>;
}

const MOBILITY_MODE_LABELS = Object.freeze({ walk: "步行", transit: "公交 / 地铁", taxi: "打车" });

function MobilityPlanningCard({ mobility }) {
  if (!mobility) return null;
  if (!["completed", "partial"].includes(mobility.status)) {
    const title = mobility.status === "needs_context" ? "还不能核验城市内移动" : "城市路线资料暂不可用";
    const detail = mobility.reason === "selected_places_changed"
      ? "地点选择刚刚变化，路线需要重新计算。"
      : mobility.reason === "at_least_two_selected_places_required"
        ? "至少确认两个地点后，才能比较步行、公交地铁和打车。"
        : "暂时无法取得高德城市路线资料；当前不会用地点信息冒充真实路线。";
    return <section className="mobility-card pending"><Train weight="duotone" /><div><strong>{title}</strong><p>{detail}</p></div></section>;
  }
  return <section className={`mobility-card ${mobility.status}`} aria-labelledby="mobility-card-title">
    <header><span><Train weight="duotone" /></span><div><strong id="mobility-card-title">已选地点之间怎么走</strong><p>{mobility.status === "partial" ? "部分路线仍待补齐" : "已完成城市移动核验"} · 不是实时到站或即时叫车结果</p></div></header>
    {["partial", "unverified"].includes(mobility.travelerFit?.accessibilityEvidence) ? <div className="mobility-care-warning"><WarningCircle weight="fill" /><span>{mobility.travelerFit.accessibilityEvidence === "partial" ? "路线已标出高德资料中的直梯、扶梯、阶梯或斜坡。设施是否正在运行并非实时信息，连续无障碍仍建议现场确认。" : "步行和换乘已按同行人要求比较；本次没有取得足够的直梯、扶梯、阶梯或斜坡资料，连续无障碍仍待确认。"}</span></div> : null}
    <ol>{mobility.legs.map((leg) => {
      const recommended = leg.alternatives.find((alternative) => alternative.mode === leg.recommendedMode);
      const features = recommended?.accessibilityFeatures ?? [];
      return <li key={leg.legId}><div className="mobility-route"><strong>{leg.origin.label}</strong><NavigationArrow /><strong>{leg.destination.label}</strong></div><div className="mobility-summary"><b>{MOBILITY_MODE_LABELS[leg.recommendedMode] ?? leg.recommendedMode}</b><span>约 {recommended?.totalMinutes ?? "–"} 分钟</span>{recommended?.walkingMeters != null && <span>步行 {Math.round(recommended.walkingMeters)} 米</span>}{recommended?.transfers != null && recommended.mode === "transit" && <span>{recommended.transfers} 次换乘</span>}{recommended?.estimatedFareCny != null && recommended.mode === "taxi" && <span>估价 ¥{recommended.estimatedFareCny}</span>}</div>{features.length ? <div className="mobility-facilities" aria-label="路线设施参考">{features.map((feature) => <span key={feature.kind} className={feature.kind === "stairs" ? "barrier" : "assist"}>{feature.label}<small>非实时</small></span>)}</div> : null}<p>{leg.rationale}</p>{recommended?.steps?.length ? <details><summary>查看上车、换乘和步行</summary><ol>{recommended.steps.map((step, index) => <li key={`${leg.legId}-${index}`}><strong>{step.line || MOBILITY_MODE_LABELS[step.kind] || "路段"}</strong><span>{step.instruction}</span>{step.accessibilityFeatures?.length ? <small className="step-facility">{step.accessibilityFeatures.map((feature) => feature.label).join("、")} · 地图路线资料，非实时，现场确认</small> : null}</li>)}</ol></details> : null}{recommended?.navigationUrl && <a href={recommended.navigationUrl} target="_blank" rel="noreferrer"><NavigationArrow />在高德继续导航</a>}</li>;
    })}</ol>
    <footer><span>{formatCheckedAt(mobility.checkedAt)} · {mobility.coverage?.unscheduled ? "日程时段确定后会重新计算" : "已按日程时段查询"}</span>{mobility.sourceDocumentation ? <a href={mobility.sourceDocumentation} target="_blank" rel="noreferrer">高德路线资料说明</a> : null}</footer>
  </section>;
}

function PlanQualityNotice({ qa }) {
  const messages = [];
  if (qa?.operabilityGaps?.some((gap) => gap.code === "city_mobility_unverified")) messages.push("已选地点之间的步行、公交地铁与打车路线尚未核验，当前不能称为可执行日程。");
  if (qa?.operabilityGaps?.some((gap) => gap.code === "city_mobility_partial")) messages.push("只有部分城市移动路段完成核验，未覆盖路段仍需补齐。");
  if (qa?.hardConstraintViolations?.some((gap) => gap.code === "foreign_guest_stay_unverified")) messages.push("住宿的外宾接待资格尚未核验，入境游客暂不能进入预订跳转。");
  if (qa?.hardConstraintViolations?.some((gap) => gap.code === "traveler_walk_limit_exceeded")) messages.push("当前建议路线超过某位同行人的单段步行上限，需要换交通方式或调整地点顺序。");
  if (qa?.hardConstraintViolations?.some((gap) => gap.code === "traveler_transfer_limit_exceeded")) messages.push("当前建议路线超过某位同行人的换乘上限，需要改用更直接的路线。");
  if (qa?.hardConstraintViolations?.some((gap) => gap.code === "traveler_stairs_route_conflict")) messages.push("当前建议路线资料中含阶梯，与同行人的避开台阶要求冲突，需要更换路线或交通方式。");
  if (qa?.operabilityGaps?.some((gap) => gap.code === "traveler_step_free_route_unverified")) messages.push("需要避开台阶的同行人，其车站电梯、出入口和连续无障碍路线尚未核验。");
  if (qa?.operabilityGaps?.some((gap) => gap.code === "traveler_accessible_toilet_unverified")) messages.push("有同行人需要无障碍卫生间，当前地点与沿途设施尚未取得可靠核验。");
  if (qa?.operabilityGaps?.some((gap) => gap.code === "traveler_pacing_unverified")) messages.push("休息间隔和连续活动时长尚未排入每天的节奏。");
  if (qa?.operabilityGaps?.some((gap) => gap.code === "traveler_meal_timing_unverified")) messages.push("同行人的最晚晚餐时间尚未排入餐饮与返程动线。");
  if (qa?.operabilityGaps?.some((gap) => gap.code === "traveler_food_exclusions_unverified")) messages.push("餐饮候选尚未逐项核验同行人的饮食排除项。");
  if (qa?.operabilityGaps?.some((gap) => gap.code === "traveler_sensory_fit_unverified")) messages.push("活动的人流或感官刺激程度尚未核验是否适合相关同行人。");
  if (qa?.operabilityGaps?.some((gap) => gap.code === "weather_mitigation_required")) messages.push("已选户外体验受高风险天气影响，需要保留室内替代或调整时段。");
  if (qa?.budget?.exceedsBudget) messages.push("当前已选方案超过总预算，需要调整后再准备预订。");
  if (!messages.length) return null;
  return <div className="canvas-warning plan-quality"><WarningCircle weight="fill" /><div><strong>还有可执行性信息待补齐</strong>{messages.map((message) => <p key={message}>{message}</p>)}</div></div>;
}

function travelerCareLabels(traveler) {
  const care = traveler?.careNeeds ?? {};
  const labels = [];
  if (care.mobility?.maxContinuousWalkMeters != null) labels.push(`单段步行≤${care.mobility.maxContinuousWalkMeters}米`);
  else if (care.mobility?.reduceWalking) labels.push("需要少走路");
  if (care.mobility?.maxTransfers != null) labels.push(`最多换乘${care.mobility.maxTransfers}次`);
  if (care.mobility?.stepFreeRequired) labels.push("需要连续无台阶");
  else if (care.mobility?.avoidStairs) labels.push("尽量避开楼梯");
  if (care.mobility?.wheelchairSpaceRequired) labels.push("需要轮椅空间");
  if (care.mobility?.luggageAssistanceRequired) labels.push("减少搬运行李");
  if (care.stamina?.restEveryMinutes != null) labels.push(`每${care.stamina.restEveryMinutes}分钟休息`);
  else if (care.stamina?.needsFrequentRest) labels.push("需要频繁休息");
  if (care.stamina?.maxActiveMinutesPerBlock != null) labels.push(`连续活动≤${care.stamina.maxActiveMinutesPerBlock}分钟`);
  if (care.schedule?.earliestStartTime) labels.push(`${care.schedule.earliestStartTime}后出发`);
  if (care.schedule?.latestReturnTime) labels.push(`${care.schedule.latestReturnTime}前返回`);
  if (care.schedule?.latestDinnerTime) labels.push(`晚饭不晚于${care.schedule.latestDinnerTime}`);
  if (care.facilities?.accessibleToiletRequired) labels.push("需核验无障碍卫生间");
  else if (care.facilities?.toiletAccessPriority) labels.push("优先卫生间便利");
  if (care.facilities?.nursingRoomRequired) labels.push("需要母婴室");
  if (care.facilities?.strollerFriendlyRequired) labels.push("婴儿车友好");
  if (care.facilities?.quietRetreatRequired) labels.push("需要安静休息区");
  if (care.sensory?.avoidCrowds) labels.push("尽量避开拥挤");
  if (care.sensory?.avoidStrongSensoryStimuli) labels.push("减少强噪声/强光");
  if (care.food?.exclusions?.length) labels.push(`饮食避开：${care.food.exclusions.join("、")}`);
  return labels;
}

function TravelerCareSummary({ trip }) {
  const travelers = (trip?.travelers ?? []).map((traveler) => ({ ...traveler, labels: travelerCareLabels(traveler) }));
  const specific = travelers.filter((traveler) => traveler.labels.length || traveler.relationship || !/^同行人 \d+$/.test(traveler.displayName ?? ""));
  const facts = [
    trip?.totalBudget != null ? { icon: CurrencyCircleDollar, text: `总预算 ¥${new Intl.NumberFormat("zh-CN").format(trip.totalBudget)}` } : null,
    trip?.pace ? { icon: PersonSimpleWalk, text: `整体节奏：${trip.pace}` } : null,
  ].filter(Boolean);
  if (!facts.length && !specific.length && (trip?.travelerCount ?? 0) <= 1) return null;
  return <section className="traveler-care" aria-labelledby="traveler-care-title">
    <header><span><Heart weight="fill" /></span><div><strong id="traveler-care-title">同行人的安排重点</strong><p>按每个人分别保存，只使用会影响路线、住宿、活动和餐饮的要求。</p></div></header>
    {facts.length ? <div className="trip-fact-chips">{facts.map(({ icon: Icon, text }) => <span key={text}><Icon />{text}</span>)}</div> : null}
    {specific.length ? <ul>{specific.map((traveler) => <li key={traveler.travelerId}><div><strong>{traveler.displayName || "同行人"}</strong>{traveler.relationship && traveler.relationship !== traveler.displayName ? <span>{traveler.relationship}</span> : null}</div><p>{traveler.labels.length ? traveler.labels.join(" · ") : "已分别记录，暂无额外行动要求"}</p></li>)}</ul> : <p className="care-empty">还没有分别记录同行人的行动需求；可以继续告诉我谁需要少走路、少换乘、固定休息或特定设施。</p>}
  </section>;
}

function PlanCanvas({ conversation, trip, plan, dataUnavailable, onRefresh, onRetryResearch, onAcceptProposal, onRejectProposal, loading }) {
  const items = useMemo(() => Object.entries(plan?.byDomain ?? {}).flatMap(([domain, nodes]) => nodes.filter((node) => node.selected).map((node) => ({ ...node, domain }))), [plan]);
  const proposal = plan?.pendingProposals?.[0] ?? null;
  const [selections, setSelections] = useState({});
  useEffect(() => {
    if (!proposal) return setSelections({});
    setSelections(Object.fromEntries(DOMAIN_ITEMS.map(({ key }) => {
      const candidates = proposal.byDomain?.[key] ?? [];
      const explicit = candidates.find((candidate) => candidate.selected)?.nodeId;
      if (explicit) return [key, explicit];
      return [key, null];
    }).filter(([, nodeId]) => nodeId)));
  }, [proposal?.proposalId]);
  return <aside className="plan-canvas" id="trip-plan-canvas">
    <div className="canvas-topline"><span className="eyebrow">这趟旅行</span>{trip ? <button className="quiet-button" onClick={onRefresh} disabled={loading}><ArrowsClockwise />刷新方案</button> : null}</div>
    {trip ? <>
      <div className="trip-summary"><div><span className="summary-place"><MapPin weight="fill" /></span><h2>{trip.destination || "目的地待补充"}</h2><p>{trip.dates || (trip.durationDays ? `${trip.durationDays} 天` : "时间待确认")} · {trip.travelerCount} 位同行人{trip.origin ? ` · 从${trip.origin}出发` : ""}{trip.arrivalMode ? ` · ${trip.arrivalMode}抵达` : ""}</p></div></div>
      <TravelerCareSummary trip={trip} />
      <WeatherPlanningCard weather={plan?.weather} />
      <div className="domain-coverage">{DOMAIN_ITEMS.map(({ key, label, icon: Icon }) => { const acceptedCount = plan?.byDomain?.[key]?.filter((node) => node.selected).length ?? 0; const pendingCount = proposal?.byDomain?.[key]?.length ?? 0; return <div key={key} className={acceptedCount || pendingCount ? "covered" : ""}><Icon weight="duotone" /><span>{label}</span><small>{acceptedCount ? "已选" : pendingCount ? `${pendingCount} 个候选` : "待研究"}</small></div>; })}</div>
      <TripMapPreview tripId={trip.tripId} plan={plan} />
      <MobilityPlanningCard mobility={plan?.mobility} />
      {proposal ? <ProposalPanel proposal={proposal} selections={selections} onSelect={(domain, nodeId) => setSelections((current) => ({ ...current, [domain]: nodeId }))} onAccept={onAcceptProposal} onReject={onRejectProposal} loading={loading} /> : items.length ? <><div className="accepted-heading"><h3>已确认方案</h3><span>可继续在对话中调整</span></div><ol className="draft-timeline">{items.map((item) => { const Icon = DOMAIN_ITEMS.find((domain) => domain.key === item.domain)?.icon ?? Compass; return <li key={item.nodeId}>{item.media?.[0] ? <img className="timeline-photo" src={item.media[0].url} alt={item.media[0].title || `${item.title}实景图`} loading="lazy" referrerPolicy="no-referrer" /> : <span className="draft-domain"><Icon weight="duotone" /></span>}<div><strong>{item.title}</strong><p>{item.summary || "待补充说明"}</p><small>{acceptedSourceLabel(item)}</small><div className="candidate-links">{item.operability?.navigationUrl && <a href={item.operability.navigationUrl} target="_blank" rel="noreferrer"><NavigationArrow />在高德查看位置</a>}{item.operability?.bookingUrl && <a href={item.operability.bookingUrl} target="_blank" rel="noreferrer"><NavigationArrow />在{item.operability.bookingProviderLabel || "供应方"}查看</a>}</div></div></li>; })}</ol><PlanQualityNotice qa={plan?.qa} /></> : dataUnavailable ? <div className="canvas-empty blocked-research"><WarningCircle weight="duotone" /><h3>暂时找不到实时地点资料</h3><p>你的旅行要求已经记住了。等资料恢复后再继续查找，之前说过的内容不用重来。</p><button className="button retry" onClick={onRetryResearch} disabled={loading}><ArrowsClockwise />重新查找旅行方案</button></div> : <div className="canvas-empty"><Sparkle weight="duotone" /><h3>还差一点旅行信息</h3><p>继续在左侧对话。助手会记住你已经说过的内容，只追问真正影响方案的问题。</p></div>}
    </> : <div className="canvas-empty pre-trip"><div className="canvas-illustration"><MapPin weight="duotone" /><Train weight="duotone" /><MapPin weight="fill" /></div><h2>方案会在对话后出现</h2><p>先在左侧说出目的地、时间、同行人或一个模糊想法。旅行助手会持续记住补充内容，再把吃、住、行、玩放到这里一起比较。</p><div className="canvas-checks"><span><CheckCircle weight="fill" />不要求先手动做行程</span><span><CheckCircle weight="fill" />每一项都有来源与取舍</span><span><CheckCircle weight="fill" />确认后才加入旅行</span></div></div>}
    {conversation?.messages?.some((message) => message.role === "status" && message.kind?.includes("model")) && <div className="canvas-warning"><WarningCircle weight="fill" /><div><strong>旅行助手暂时无法回应</strong><p>你的需求会保留，服务恢复后可以从这里继续。</p></div></div>}
  </aside>;
}

function ConversationPicker({ conversations, activeId, onPick, onNew }) {
  return <aside className="conversation-picker"><div><span className="eyebrow">你的旅行对话</span><h2>继续编辑</h2></div><button className="new-chat" onClick={onNew}><Plus />新对话</button><div className="conversation-list">{conversations.length ? conversations.map((conversation) => <button key={conversation.conversationId} onClick={() => onPick(conversation.conversationId)} className={conversation.conversationId === activeId ? "active" : ""}><strong>{conversation.messages.find((message) => message.role === "user")?.text || "新的旅行想法"}</strong><small>{conversation.tripId ? "已建立旅行草案" : "等待旅行需求"}</small></button>) : <p>还没有对话。</p>}</div></aside>;
}

function TravelEditor({ session, onLogout }) {
  const [conversations, setConversations] = useState([]);
  const [conversation, setConversation] = useState(null);
  const [draft, setDraft] = useState("");
  const [pendingText, setPendingText] = useState("");
  const [trip, setTrip] = useState(null);
  const [plan, setPlan] = useState(null);
  const [providerStatus, setProviderStatus] = useState(null);
  const [selectedModelId, setSelectedModelId] = useState("");
  const [status, setStatus] = useState({ loading: true });
  const scrollerRef = useRef(null);
  const refreshConversations = useCallback(async () => {
    const result = await api.listConversations();
    setConversations(result.conversations);
    return result.conversations;
  }, []);
  const loadTrip = useCallback(async (tripId) => {
    if (!tripId) { setTrip(null); setPlan(null); return; }
    const [control, nextPlan] = await Promise.all([api.control(tripId), api.plan(tripId)]);
    setTrip({
      tripId,
      destination: control.brief.destination,
      dates: control.brief.dates,
      durationDays: control.brief.durationDays,
      origin: control.brief.origin,
      arrivalMode: control.brief.arrivalMode,
      travelerCount: control.travelers.length,
      travelers: control.travelers,
      totalBudget: control.brief.totalBudget,
      pace: control.brief.pace,
    });
    setPlan(nextPlan);
  }, []);
  useEffect(() => {
    if (!scrollerRef.current) return;
    scrollerRef.current.scrollTo({ top: scrollerRef.current.scrollHeight, behavior: "smooth" });
  }, [conversation?.messages?.length, status.loading, status.activities]);
  const selectConversation = useCallback(async (conversationId) => {
    setStatus({ loading: true });
    try {
      const selected = await api.conversation(conversationId);
      setConversation(selected);
      setSelectedModelId(selected.modelId);
      await loadTrip(selected.tripId);
      setStatus({});
    } catch (error) { setStatus({ error: messageError(error) }); }
  }, [loadTrip]);
  useEffect(() => {
    Promise.all([refreshConversations(), api.providerStatus()]).then(async ([items, providers]) => {
      setProviderStatus(providers);
      setSelectedModelId((current) => current || providers.modelSelection?.defaultModelId || "deepseek-v4-flash");
      if (items[0]) await selectConversation(items[0].conversationId);
      else setStatus({});
    }).catch((error) => setStatus({ error: messageError(error) }));
  }, [refreshConversations, selectConversation]);
  const createConversation = async () => {
    setStatus({ loading: true });
    try {
      const modelId = selectedModelId || providerStatus?.modelSelection?.defaultModelId || "deepseek-v4-flash";
      const created = await api.createConversation({ modelId });
      setConversation(created); setTrip(null); setPlan(null); setDraft("");
      setSelectedModelId(created.modelId);
      await refreshConversations(); setStatus({});
    } catch (error) { setStatus({ error: messageError(error) }); }
  };
  const submitMessage = async (text) => {
    const clean = text.trim();
    if (!clean || status.loading) return;
    setStatus({ loading: true }); setPendingText(clean); setDraft("");
    try {
      let current = conversation;
      const modelId = selectedModelId || providerStatus?.modelSelection?.defaultModelId || "deepseek-v4-flash";
      if (!current) current = await api.createConversation({ modelId });
      const result = await api.sendConversationMessage(current.conversationId, clean, modelId);
      setConversation(result.conversation);
      setSelectedModelId(result.conversation.modelId);
      await refreshConversations();
      await loadTrip(result.tripId ?? result.conversation.tripId);
      setPendingText("");
      setStatus({ activities: result.activities ?? [], turnStatus: result.status });
    } catch (error) { setPendingText(""); setDraft(clean); setStatus({ error: messageError(error) }); }
  };
  const acceptProposal = async (proposalId, selections) => {
    if (!trip?.tripId || status.loading) return;
    setStatus({ loading: true });
    try {
      const result = await api.accept(trip.tripId, proposalId, selections);
      if (result.status !== "committed") throw Object.assign(new Error(result.status), { code: result.validation?.reason ?? result.status });
      await loadTrip(trip.tripId);
      setStatus({ loading: true, activities: [{ toolName: "accept_trip_change", status: "committed" }, { toolName: "refresh_trip_mobility", status: "running" }] });
      const mobility = await api.refreshMobility(trip.tripId);
      await loadTrip(trip.tripId);
      setStatus({ activities: [{ toolName: "accept_trip_change", status: "committed" }, { toolName: "refresh_trip_mobility", status: mobility.status }] });
    } catch (error) { setStatus({ error: messageError(error) }); }
  };
  const rejectProposal = async (proposalId) => {
    if (!trip?.tripId || status.loading) return;
    setStatus({ loading: true });
    try {
      await api.reject(trip.tripId, proposalId);
      await loadTrip(trip.tripId);
      setStatus({ activities: [{ toolName: "reject_trip_change", status: "rejected_by_user" }] });
    } catch (error) { setStatus({ error: messageError(error) }); }
  };
  const modelOptions = providerStatus?.modelSelection?.options ?? [];
  const modelLabels = useMemo(() => Object.fromEntries(modelOptions.map((option) => [option.id, option.shortLabel])), [modelOptions]);
  return <main className="editor-shell">
    <header className="editor-topbar"><div className="brand"><MapPin weight="fill" /> Travel Agent</div><div className="topbar-copy"><span>旅行助手</span><small>从一句话到可确认方案</small></div>{trip ? <button className="plan-jump" onClick={() => document.getElementById("trip-plan-canvas")?.scrollIntoView({ behavior: "smooth", block: "start" })}><MapTrifold />查看方案</button> : null}<div className="account-actions"><span>{session.displayName || SESSION_PROVIDER_LABELS[session.provider] || "旅行者"}</span><button className="icon-button" onClick={onLogout} aria-label="退出登录"><SignOut /></button></div></header>
    <div className="editor-layout">
      <ConversationPicker conversations={conversations} activeId={conversation?.conversationId} onPick={selectConversation} onNew={createConversation} />
      <section className="conversation-panel">
        <header className="conversation-header"><div><span className="eyebrow">旅行对话</span><h2>{conversation?.tripId ? "继续完善这趟旅行" : "描述你的旅行想法"}</h2></div>{conversation?.tripId ? <span className="draft-state"><CheckCircle weight="fill" />已记住旅行要求</span> : <span className="draft-state muted">从一句话开始</span>}</header>
        {status.error && <div className="chat-error" role="alert"><WarningCircle />{status.error}<button onClick={() => setStatus({})}>关闭提示</button></div>}
        <div className="message-scroller" ref={scrollerRef}>{!conversation?.messages?.length ? pendingText && status.loading ? <><article className="chat-message user pending"><div className="message-avatar">你</div><div className="message-copy"><MessageBody text={pendingText} /><time>正在发送</time></div></article><ThinkingMessage /></> : <ConversationIntro onPrompt={(prompt) => submitMessage(prompt)} /> : <>{conversation.messages.map((message) => <MessageBubble key={message.messageId} message={message} modelLabel={modelLabels[message.modelId]} />)}{status.loading && <ThinkingMessage />}<ActivityStrip activities={status.activities} /></>}</div>
        <Composer value={draft} onChange={setDraft} onSubmit={submitMessage} loading={status.loading} modelOptions={modelOptions} modelId={selectedModelId} defaultModelId={providerStatus?.modelSelection?.defaultModelId} onModelChange={setSelectedModelId} />
      </section>
      <PlanCanvas conversation={conversation} trip={trip} plan={plan} dataUnavailable={providerStatus?.data?.amapOfficialMcp === "blocked" && !["available_read_only", "trial_read_only"].includes(providerStatus?.data?.fliggyFlyAi) && providerStatus?.data?.tuniuOfficialMcp !== "available_read_only"} onRefresh={() => loadTrip(conversation?.tripId).catch((error) => setStatus({ error: messageError(error) }))} onRetryResearch={() => submitMessage("继续规划，请重新查找吃、住、行、玩方案。") } onAcceptProposal={acceptProposal} onRejectProposal={rejectProposal} loading={status.loading} />
    </div>
  </main>;
}

export function TravelApp() {
  const [session, setSession] = useState(undefined);
  const [health, setHealth] = useState(null);
  const [authProviders, setAuthProviders] = useState(null);
  const [authError, setAuthError] = useState(null);
  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    setAuthError(query.get("auth_error"));
    Promise.all([api.session().catch(() => null), api.health().catch(() => null), api.authProviders().catch(() => null)]).then(([nextSession, nextHealth, nextProviders]) => {
      setSession(nextSession);
      setHealth(nextHealth);
      setAuthProviders(nextProviders);
      if (query.has("auth") || query.has("auth_error")) {
        query.delete("auth");
        query.delete("auth_error");
        const nextQuery = query.toString();
        window.history.replaceState({}, "", `${window.location.pathname}${nextQuery ? `?${nextQuery}` : ""}${window.location.hash}`);
      }
    });
  }, []);
  const logout = async () => { await api.logout().catch(() => null); setSession(null); };
  if (session === undefined) return <main className="app-loading"><CircleNotch className="spin" />正在恢复会话</main>;
  if (!session) return <LoginScreen onSession={setSession} developmentAuthEnabled={health?.developmentAuthEnabled === true} providerStatus={authProviders} initialError={authError} />;
  return <TravelEditor session={session} onLogout={logout} />;
}
