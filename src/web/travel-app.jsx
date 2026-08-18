import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AppleLogo, ArrowsClockwise, Baby, BatteryCharging, CalendarBlank, CaretDown, CheckCircle, ChatsCircle, CircleNotch,
  Clock, CloudSun, Compass, CurrencyCircleDollar, Elevator, ForkKnife, GoogleLogo, Heart, House, List, MapPin,
  MapTrifold, Microphone, NavigationArrow, PaperPlaneRight, PersonSimpleWalk, Plus, QrCode, SignOut, Sparkle,
  Stairs, StopCircle, Toilet, Train, WarningCircle, WechatLogo, Wheelchair, X,
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

function formatConversationRecency(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "刚刚更新";
  const now = new Date();
  const sameDay = now.toDateString() === date.toDateString();
  return sameDay
    ? `今天 ${new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit" }).format(date)}`
    : new Intl.DateTimeFormat("zh-CN", { month: "numeric", day: "numeric" }).format(date);
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function storedPaneLayout() {
  if (typeof window === "undefined") return { sessions: 236, conversation: 420 };
  try {
    const stored = JSON.parse(window.localStorage.getItem("travel-agent-pane-layout-v1") || "{}");
    return {
      sessions: clamp(Number(stored.sessions) || 236, 200, 340),
      conversation: clamp(Number(stored.conversation) || 420, 340, 720),
    };
  } catch {
    return { sessions: 236, conversation: 420 };
  }
}

function ResizeHandle({ className = "", label, onPointerDown, onNudge }) {
  return <div
    className={`pane-resizer ${className}`}
    role="separator"
    aria-label={label}
    aria-orientation="vertical"
    tabIndex={0}
    onPointerDown={onPointerDown}
    onKeyDown={(event) => {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      event.preventDefault();
      onNudge(event.key === "ArrowLeft" ? -24 : 24);
    }}
  ><span /></div>;
}

function formatCheckedAt(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "核验时间未知";
  return `${new Intl.DateTimeFormat("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(date)} 核验`;
}

function consumerProviderLabel(value) {
  const cleaned = String(value ?? "")
    .replace(/\s*AI\s*开放平台/gi, "")
    .replace(/\s*官方\s*MCP/gi, "")
    .replace(/\s*MCP/gi, "")
    .replace(/\s*\+\s*/g, " · ")
    .replace(/\s{2,}/g, " ")
    .trim();
  return cleaned || "旅行资料来源";
}

function tripBriefChips(trip) {
  if (!trip) return [];
  return [
    { key: "destination", label: trip.destination || "目的地待补", missing: !trip.destination, prompt: "我想补充目的地：" },
    { key: "dates", label: trip.dates || (trip.durationDays ? `${trip.durationDays} 天` : "时间待补"), missing: !trip.dates && !trip.durationDays, prompt: "我想补充旅行时间：" },
    { key: "travelers", label: `${trip.travelerCount || 1} 人同行`, missing: false, prompt: "我想调整同行人：" },
    { key: "pace", label: trip.pace || "节奏待补", missing: !trip.pace, prompt: "我希望旅行节奏是：" },
    { key: "origin", label: trip.origin ? `${trip.origin}出发` : "出发地待补", missing: !trip.origin, prompt: "我从这里出发：" },
    { key: "budget", label: trip.totalBudget != null ? `预算 ¥${new Intl.NumberFormat("zh-CN").format(trip.totalBudget)}` : "预算待补", missing: trip.totalBudget == null, prompt: "这趟旅行的总预算是：" },
  ];
}

function quickRepliesForTrip(trip) {
  if (!trip) return [];
  if (trip.totalBudget == null) return [
    { label: "位置优先", text: "住宿位置优先，预算可以根据方便程度再权衡。" },
    { label: "住宿每晚 ¥500 内", text: "住宿预算希望控制在每晚 500 元以内。" },
    { label: "住宿每晚 ¥500–900", text: "住宿预算可以接受每晚 500 到 900 元。" },
  ];
  if (!trip.origin) return [
    { label: "补充出发地", prefill: "我从这里出发：" },
    { label: "暂不安排城际", text: "先规划目的地内的住宿、游玩、美食和当地交通，城际交通之后再补。" },
    { label: "优先少换乘", text: "城际和当地交通都优先少换乘。" },
  ];
  return [
    { label: "少走路", text: "请在不改变已确认安排的前提下，让每天少走一点。" },
    { label: "位置优先", text: "住宿和餐饮优先选择更顺路的位置。" },
    { label: "控制预算", text: "请比较一版更节省预算、但不明显增加体力负担的方案。" },
  ];
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
  const [expanded, setExpanded] = useState(false);
  const lines = String(text ?? "").split(/\n+/).filter((line, index, values) => line.trim() || (index > 0 && index < values.length - 1));
  const isLong = String(text ?? "").length > 560 || lines.length > 4;
  const visibleLines = !expanded && isLong
    ? (lines.length > 3 ? [lines[0], lines[1], lines.at(-1)] : lines)
    : lines;
  return <div className={`message-body ${isLong && !expanded ? "collapsed" : ""}`}>{visibleLines.map((line, index) => {
    const pieces = line.split(/(\*\*[^*]+\*\*)/g).filter(Boolean);
    return <span key={`${line}-${index}`} className="message-line">{pieces.map((piece, pieceIndex) => piece.startsWith("**") && piece.endsWith("**") ? <strong key={pieceIndex}>{piece.slice(2, -2)}</strong> : piece)}</span>;
  })}{isLong ? <button type="button" className="message-expand" onClick={() => setExpanded((current) => !current)}>{expanded ? "收起说明" : "展开完整说明"}<CaretDown className={expanded ? "expanded" : ""} /></button> : null}</div>;
}

function MessageBubble({ message }) {
  if (message.role === "status") return <div className="conversation-status"><WarningCircle weight="fill" /><span>{message.text}</span></div>;
  return <article className={`chat-message ${message.role}`}>
    <div className="message-avatar" aria-hidden="true">{message.role === "user" ? "你" : <Sparkle weight="fill" />}</div>
    <div className="message-copy"><MessageBody text={message.text} /><time>{message.role === "user" ? "你的需求" : "Travel Agent"} · {formatTime(message.createdAt)}</time></div>
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

function Composer({ value, onChange, onSubmit, loading }) {
  const inputRef = useRef(null);
  const recognitionRef = useRef(null);
  const [voiceState, setVoiceState] = useState("idle");
  const [voiceNotice, setVoiceNotice] = useState("");
  const speechRecognition = typeof window !== "undefined" ? window.SpeechRecognition || window.webkitSpeechRecognition : null;
  const toggleVoice = () => {
    if (voiceState === "listening") {
      recognitionRef.current?.stop();
      return;
    }
    if (!speechRecognition) {
      setVoiceNotice("当前设备暂不支持语音转写，请使用键盘输入。");
      return;
    }
    const recognition = new speechRecognition();
    recognition.lang = "zh-CN";
    recognition.continuous = false;
    recognition.interimResults = true;
    const base = value.trim();
    recognition.onstart = () => { setVoiceState("listening"); setVoiceNotice("正在听，转写后可以修改再发送。"); };
    recognition.onresult = (event) => {
      const transcript = Array.from(event.results).map((result) => result[0]?.transcript ?? "").join("");
      onChange([base, transcript].filter(Boolean).join(base && transcript ? " " : ""));
    };
    recognition.onerror = (event) => {
      setVoiceState("idle");
      setVoiceNotice(event.error === "not-allowed" ? "没有取得麦克风权限，请在系统设置中允许后重试。" : "这次没有听清，可以重试或继续打字。");
    };
    recognition.onend = () => { setVoiceState("idle"); setVoiceNotice((current) => current || "转写完成，可以修改后发送。"); };
    recognitionRef.current = recognition;
    recognition.start();
  };
  return <form className="chat-composer" onSubmit={(event) => { event.preventDefault(); onSubmit(value); }}>
    <textarea ref={inputRef} value={value} onChange={(event) => onChange(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); onSubmit(value); } }} rows={1} maxLength={4_000} placeholder="例如：国庆和父母去大理 5 天，轻松一点，住得方便，想吃本地菜。" />
    <div className="composer-footer">
      <button type="button" className={`voice-button ${voiceState}`} onClick={toggleVoice} aria-label={voiceState === "listening" ? "停止语音输入" : "开始语音输入"} aria-pressed={voiceState === "listening"}>{voiceState === "listening" ? <StopCircle weight="fill" /> : <Microphone weight="bold" />}</button>
      <span className="composer-privacy">{voiceNotice || "语音会先转成文字，由你确认后再发送"}</span>
      <button className="send-button" aria-label="发送旅行需求" disabled={loading || !value.trim()}>{loading ? <CircleNotch className="spin" /> : <PaperPlaneRight weight="fill" />}</button>
    </div>
  </form>;
}

function ActivityStrip({ activities }) {
  if (!activities?.length) return null;
  const labels = { save_trip_understanding: "已记住旅行要求", research_trip_options: "正在查找吃住行玩", get_trip_control_view: "已读取旅行要求", get_trip_plan_view: "已读取当前方案", accept_trip_change: "已确认方案", refresh_trip_mobility: "已核验城市内移动", reject_trip_change: "已放弃候选" };
  return <div className="activity-strip" aria-live="polite" aria-label="本轮处理进度">{activities.map((activity, index) => <span key={`${activity.toolName}-${index}`} className={["provider_unavailable", "AUTH_REQUIRED", "ACCOUNT_LIMITED", "RATE_LIMITED", "SOURCE_UNAVAILABLE", "EMPTY_VERIFIED"].includes(activity.status) ? "warning" : ""}>{activity.toolName === "restore_trip_draft" ? activity.status === "recovered" ? "已恢复旅行草案" : "旅行草案需要恢复" : activity.toolName === "research_trip_options" && ["provider_unavailable", "AUTH_REQUIRED", "SOURCE_UNAVAILABLE"].includes(activity.status) ? "没有取得实时地点资料" : activity.toolName === "research_trip_options" && activity.status === "ACCOUNT_LIMITED" ? "地图资料暂时无法访问" : activity.toolName === "research_trip_options" && activity.status === "RATE_LIMITED" ? "实时资料请求较多，请稍后再试" : activity.toolName === "research_trip_options" && activity.status === "EMPTY_VERIFIED" ? "暂未找到可靠地点资料" : activity.toolName === "refresh_trip_mobility" && activity.status === "provider_unavailable" ? "城市路线资料暂不可用" : activity.toolName === "refresh_trip_mobility" && activity.status === "needs_context" ? "确认更多地点后再核验路线" : `${labels[activity.toolName] ?? "正在处理旅行要求"}${activity.status === "proposed" ? "，可以在方案中比较" : ""}`}</span>)}</div>;
}

function CandidatePhoto({ candidate }) {
  const photo = candidate.media?.[0];
  return photo ? <img className="candidate-photo" src={photo.url} alt={photo.title || `${candidate.title}实景图`} loading="lazy" referrerPolicy="no-referrer" /> : null;
}

function mappedFacilityLabels(detail) {
  return (detail?.mappedFacilities ?? []).map((facility) => facility.label).filter(Boolean);
}

function domainMeta(domain) {
  return DOMAIN_ITEMS.find((item) => item.key === domain) ?? DOMAIN_ITEMS[0];
}

function scheduleLabel(item) {
  const value = item?.time ?? item?.operability?.departureAt ?? item?.operability?.arrivalAt;
  if (!value) return "待排入日程";
  if (/^\d{1,2}:\d{2}$/.test(value)) return value;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(date);
}

function facilityIcon(facility) {
  const value = `${facility?.kind ?? ""} ${facility?.label ?? facility ?? ""}`.toLowerCase();
  if (value.includes("toilet") || value.includes("卫生间") || value.includes("洗手间")) return Toilet;
  if (value.includes("elevator") || value.includes("直梯") || value.includes("电梯")) return Elevator;
  if (value.includes("stair") || value.includes("楼梯") || value.includes("阶梯") || value.includes("扶梯")) return Stairs;
  if (value.includes("ramp") || value.includes("坡道") || value.includes("无障碍")) return Wheelchair;
  if (value.includes("charge") || value.includes("充电")) return BatteryCharging;
  if (value.includes("baby") || value.includes("母婴")) return Baby;
  return MapPin;
}

function FacilityReferences({ facilities, emptyText = "该地点没有返回可用设施资料，不代表现场没有。" }) {
  if (!facilities?.length) return <p className="facility-empty">{emptyText}</p>;
  return <div className="facility-reference-grid">{facilities.map((facility, index) => {
    const normalized = typeof facility === "string" ? { label: facility } : facility;
    const Icon = facilityIcon(normalized);
    const barrier = normalized.kind === "stairs" || /楼梯|阶梯/.test(normalized.label ?? "");
    return <span key={`${normalized.kind ?? normalized.label}-${index}`} className={barrier ? "barrier" : "assist"}><Icon weight="duotone" /><b>{normalized.label || "设施参考"}</b><small>非实时</small></span>;
  })}</div>;
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

function amapMarkerUrl(node) {
  const coordinates = node?.location?.coordinates;
  if (!Number.isFinite(coordinates?.longitude) || !Number.isFinite(coordinates?.latitude)) return node?.operability?.navigationUrl ?? null;
  const parameters = new URLSearchParams({
    position: `${coordinates.longitude},${coordinates.latitude}`,
    name: node.title,
    src: "zhuanshu-travel-agent",
    coordinate: coordinates.coordinateSystem === "WGS-84" ? "wgs84" : "gaode",
    callnative: "0",
  });
  return `https://uri.amap.com/marker?${parameters}`;
}

function hasSpecificTravelDates(value) {
  return (String(value ?? "").match(/20\d{2}-\d{2}-\d{2}/g) ?? []).length >= 2;
}

function PlanNextStep({ trip, plan, onPrefill, onMobileViewChange }) {
  const steps = [];
  if (!hasSpecificTravelDates(trip?.dates)) steps.push({ key: "dates", title: "补充具体日期", detail: "核验天气、房态和每天节奏", prompt: "我想补充具体旅行日期：" });
  if (!trip?.origin) steps.push({ key: "origin", title: "补充出发地", detail: "补齐城际交通和首末日衔接", prompt: "我的出发地是：" });
  if (!(plan?.byDomain?.food ?? []).some((node) => node.selected)) steps.push({ key: "food", title: "继续找本地菜", detail: "把餐饮放进住宿和游玩动线", prompt: "请继续查找适合我们、顺路的本地菜和餐厅。" });
  if (!steps.length) return null;
  return <section className="next-step-guide" aria-labelledby="next-step-title"><div><span className="eyebrow">接下来完成</span><h3 id="next-step-title">先补最影响整趟旅行的信息</h3></div><div className="next-step-actions">{steps.slice(0, 3).map((step, index) => <button key={step.key} type="button" onClick={() => { onPrefill(step.prompt); onMobileViewChange("conversation"); }}><span>{index + 1}</span><strong>{step.title}</strong><small>{step.detail}</small><NavigationArrow /></button>)}</div></section>;
}

function ProposalPanel({ proposal, selections, onSelect, onPreviewCandidate, onAccept, onReject, loading }) {
  const availableDomains = DOMAIN_ITEMS.filter(({ key }) => (proposal.byDomain?.[key]?.length ?? 0) > 0);
  const [activeDomain, setActiveDomain] = useState(availableDomains[0]?.key ?? DOMAIN_ITEMS[0].key);
  useEffect(() => {
    setActiveDomain(availableDomains[0]?.key ?? DOMAIN_ITEMS[0].key);
  }, [proposal.proposalId]);
  const currentDomain = availableDomains.find(({ key }) => key === activeDomain) ?? availableDomains[0] ?? DOMAIN_ITEMS[0];
  const candidates = proposal.byDomain?.[currentDomain.key] ?? [];
  const selectedCount = availableDomains.filter(({ key }) => selections[key]).length;
  return <section className="proposal-panel" aria-labelledby={`proposal-${proposal.proposalId}`}>
    <header className="proposal-heading"><div><span className="proposal-state"><Sparkle weight="fill" />等你决定</span><h3 id={`proposal-${proposal.proposalId}`}>{proposal.title}</h3><p>{proposal.summary}</p></div><div className="proposal-source"><strong>{consumerProviderLabel(proposal.providerLabel)}</strong><span>{formatCheckedAt(proposal.checkedAt)}</span></div></header>
    <div className="decision-tabs" role="tablist" aria-label="切换要决定的旅行内容">{availableDomains.map(({ key, label, icon: Icon }) => <button key={key} type="button" role="tab" aria-selected={currentDomain.key === key} className={currentDomain.key === key ? "active" : ""} onClick={() => setActiveDomain(key)}><Icon weight="duotone" /><span>{label}</span><small>{selections[key] ? "已选" : `${proposal.byDomain[key].length} 个可选`}</small></button>)}</div>
    <section className="proposal-domain focused" aria-labelledby={`${proposal.proposalId}-${currentDomain.key}`}>
      <div className="domain-title"><span><currentDomain.icon weight="duotone" /></span><div><h4 id={`${proposal.proposalId}-${currentDomain.key}`}>选择一项{currentDomain.label}的安排</h4><small>选择只会形成待确认方案，不会自动预订</small></div></div>
      <div className="candidate-list">{candidates.map((candidate) => {
        const detail = candidate.operability ?? {};
        const locationLabel = candidate.location?.district || candidate.location?.label;
        const facilities = mappedFacilityLabels(detail);
        const selected = selections[currentDomain.key] === candidate.nodeId;
        return <article key={candidate.nodeId} className={`candidate-option ${candidate.media?.[0] ? "has-photo" : "no-photo"} ${selected ? "selected" : ""}`}>
          <label><input type="radio" name={`${proposal.proposalId}-${currentDomain.key}`} checked={selected} onChange={() => onSelect(currentDomain.key, candidate.nodeId)} /><CandidatePhoto candidate={candidate} /><span className="radio-mark" aria-hidden="true" /><span className="candidate-copy"><strong>{candidate.title}</strong><span>{candidate.summary || "地点详情仍待补充核验。"}</span><small>{[locationLabel, detail.rating ? `评分 ${detail.rating}` : null, detail.priceHint ? `参考消费 ${detail.priceHint}` : null, detail.weatherFit === "preferred" ? "天气优先" : detail.weatherFit === "caution" ? "天气需备选" : null].filter(Boolean).join(" · ")}</small>{facilities.length ? <em>设施参考：{facilities.join("、")} · 非实时，现场确认</em> : null}{currentDomain.key === "stay" && detail.lodgingDataNature === "amap_place_reference" ? <em>高德提供酒店位置与基础资料；指定日期房态、房型和价格仍待 OTA 核验</em> : currentDomain.key === "stay" && detail.inventoryVerified === false ? <em>酒店参考候选；指定日期房态、房型、早餐、退改和外宾资格需在 OTA 跳转页核验</em> : null}</span></label>
          <div className="candidate-links">
            <button type="button" onClick={() => onPreviewCandidate(candidate.nodeId)}><MapTrifold />查看照片和详情</button>
            {detail.navigationUrl && <a href={detail.navigationUrl} target="_blank" rel="noreferrer"><NavigationArrow />在高德查看</a>}
            {detail.bookingUrl && <a href={detail.bookingUrl} target="_blank" rel="noreferrer"><NavigationArrow />在{detail.bookingProviderLabel || "供应方"}查看</a>}
          </div>
        </article>;
      })}{!candidates.length && <p className="domain-empty">这一类暂时没有可靠候选，先保持待安排。</p>}</div>
    </section>
    <div className="proposal-notes">{proposal.caveats?.map((note) => <span key={note}><WarningCircle />{note}</span>)}</div>
    <footer className="proposal-actions"><span className="selection-progress">已完成 {selectedCount}/{availableDomains.length || 0} 项决定</span><button className="quiet-action" onClick={() => onReject(proposal.proposalId)} disabled={loading}>暂不采用</button><button className="button primary" onClick={() => onAccept(proposal.proposalId, selections)} disabled={loading || availableDomains.some(({ key }) => !selections[key])}>{loading ? <CircleNotch className="spin" /> : <CheckCircle weight="fill" />}确认整份方案</button></footer>
  </section>;
}

function TripMapPreview({ tripId, plan }) {
  const [hidden, setHidden] = useState(false);
  if (!tripId || !plan?.mapPreviewAvailable || hidden) return null;
  const hasRoutes = (plan?.mobility?.legs?.length ?? 0) > 0;
  return <figure className="trip-map-preview"><img src={api.mapUrl(tripId)} alt={hasRoutes ? "这趟旅行已核验移动路线的地图" : "这趟旅行候选地点的地图分布"} onError={() => setHidden(true)} /><figcaption><MapTrifold weight="duotone" /><span><strong>{hasRoutes ? "地点与移动路线" : "地点分布"}</strong>{hasRoutes ? "蓝色折线是当前推荐移动方式的路线估算。" : "地图只显示当前候选，确认前可继续比较。"}</span></figcaption></figure>;
}

function PlaceDetailSheet({ node, plan, tripId, onClose }) {
  const closeRef = useRef(null);
  const [summaryExpanded, setSummaryExpanded] = useState(false);
  useEffect(() => {
    if (!node) return undefined;
    setSummaryExpanded(false);
    closeRef.current?.focus();
    const closeOnEscape = (event) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [node?.nodeId, onClose]);
  if (!node) return null;
  const detail = node.operability ?? {};
  const meta = domainMeta(node.domain);
  const facilities = detail.mappedFacilities ?? [];
  const location = node.location?.address || node.location?.label || node.location?.district || "位置资料待补";
  const mapUrl = amapMarkerUrl(node);
  const facts = [
    node.cost > 0 ? { label: "参考价格", value: `¥${new Intl.NumberFormat("zh-CN").format(node.cost)}` } : null,
    detail.rating ? { label: "来源评分", value: String(detail.rating) } : null,
    detail.roomName ? { label: "房型", value: detail.roomName } : null,
    detail.meal ? { label: "早餐", value: detail.meal } : null,
    detail.refundPolicy ? { label: "退改", value: detail.refundPolicy } : null,
  ].filter(Boolean);
  const sourceLabel = consumerProviderLabel(detail.sourceLabel || detail.bookingProviderLabel || "旅行资料来源");
  const longSummary = String(node.summary ?? "").length > 320;
  return <div className="place-detail-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <aside className="place-detail-sheet" role="dialog" aria-modal="true" aria-labelledby="place-detail-title">
      <header className="place-detail-header"><div><span className="detail-domain"><meta.icon weight="duotone" />{meta.label}的详情</span><small>{sourceLabel} · {formatCheckedAt(detail.checkedAt)}</small></div><button ref={closeRef} type="button" className="icon-button" onClick={onClose} aria-label="关闭地点详情"><X /></button></header>
      <div className="place-detail-scroll">
        {node.media?.length ? <figure className={`place-gallery count-${Math.min(node.media.length, 4)}`}>{node.media.slice(0, 4).map((media, index) => <img key={`${media.url}-${index}`} src={media.url} alt={media.title || `${node.title}实景图 ${index + 1}`} loading="eager" referrerPolicy="no-referrer" />)}<figcaption>{node.media.length === 1 ? "当前来源返回 1 张实景图" : `当前来源返回 ${node.media.length} 张实景图`}</figcaption></figure> : <div className="detail-media-missing"><MapPin weight="duotone" /><span><strong>当前来源没有返回图片</strong><small>不会用通用风景图替代这个地点。</small></span></div>}
        <section className="place-detail-intro"><span className="detail-domain"><meta.icon weight="duotone" />{meta.label}</span><h2 id="place-detail-title">{node.title}</h2><p className={summaryExpanded ? "expanded" : ""}>{node.summary || "当前来源只返回了地点名称和位置。"}</p>{longSummary ? <button type="button" className="detail-text-toggle" onClick={() => setSummaryExpanded((current) => !current)}>{summaryExpanded ? "收起介绍" : "展开完整介绍"}<CaretDown className={summaryExpanded ? "expanded" : ""} /></button> : null}</section>
        {facts.length ? <section className="detail-facts" aria-label="地点关键信息">{facts.map((fact) => <div key={fact.label}><small>{fact.label}</small><strong>{fact.value}</strong></div>)}</section> : null}
        <section className="detail-section location-detail"><header><div><MapTrifold weight="duotone" /></div><span><strong>位置与地图</strong><small>{location}</small></span></header>{plan?.mapPreviewAvailable ? <TripMapPreview tripId={tripId} plan={plan} /> : <div className="detail-map-status"><MapPin weight="fill" /><span><strong>产品内地图暂时不可用</strong><small>坐标和地址已保留；高德账户恢复后会补回地图、路线和出入口。</small></span></div>}{mapUrl ? <a className="detail-primary-link" href={mapUrl} target="_blank" rel="noreferrer"><NavigationArrow />在高德查看这个地点</a> : null}</section>
        <section className="detail-section facilities-detail"><header><div><Elevator weight="duotone" /></div><span><strong>设施与可达性</strong><small>{facilities.length ? "地图资料 · 非实时 · 建议现场确认" : "当前来源尚未返回设施资料"}</small></span></header><FacilityReferences facilities={facilities} emptyText={node.domain === "stay" ? "当前酒店来源只返回了图片、位置和参考价格；电梯、停车、早餐、卫生间等设施需要在酒店详情页继续核验。" : "当前来源没有返回卫生间、电梯、坡道或储物设施；不代表现场没有，出发前仍需核验。"} />{detail.indoorMap || detail.indoor ? <p className="facility-note">已取得室内或楼层相关资料；入口、楼层和开放情况仍以现场为准。</p> : null}{detail.bookingUrl ? <a className="detail-primary-link" href={detail.bookingUrl} target="_blank" rel="noreferrer"><NavigationArrow />在{detail.bookingProviderLabel || "供应方"}查看完整图片与设施</a> : null}</section>
        <section className="detail-source-note"><WarningCircle weight="fill" /><p>{acceptedSourceLabel(node)}。图片、价格、房态、营业状态和设施信息以跳转页或现场为准。</p></section>
      </div>
    </aside>
  </div>;
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

function MobilityPlanningCard({ mobility, activeLegId, onSelectLeg }) {
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
  const activeLeg = mobility.legs.find((leg) => leg.legId === activeLegId) ?? mobility.legs[0];
  const recommended = activeLeg?.alternatives.find((alternative) => alternative.mode === activeLeg.recommendedMode);
  const features = recommended?.accessibilityFeatures ?? [];
  return <section className={`mobility-card ${mobility.status}`} aria-labelledby="mobility-card-title">
    <header><span><Train weight="duotone" /></span><div><strong id="mobility-card-title">已选地点之间怎么走</strong><p>{mobility.status === "partial" ? "部分路线仍待补齐" : "已完成城市移动核验"} · 不是实时到站或即时叫车结果</p></div></header>
    {["partial", "unverified"].includes(mobility.travelerFit?.accessibilityEvidence) ? <div className="mobility-care-warning"><WarningCircle weight="fill" /><span>{mobility.travelerFit.accessibilityEvidence === "partial" ? "路线已标出高德资料中的直梯、扶梯、阶梯或斜坡。设施是否正在运行并非实时信息，连续无障碍仍建议现场确认。" : "步行和换乘已按同行人要求比较；本次没有取得足够的直梯、扶梯、阶梯或斜坡资料，连续无障碍仍待确认。"}</span></div> : null}
    {mobility.legs.length > 1 ? <div className="route-selector" role="tablist" aria-label="选择要查看的移动路段">{mobility.legs.map((leg, index) => <button key={leg.legId} type="button" role="tab" aria-selected={leg.legId === activeLeg?.legId} className={leg.legId === activeLeg?.legId ? "active" : ""} onClick={() => onSelectLeg?.(leg.legId)}><small>第 {index + 1} 段</small><span>{leg.origin.label} → {leg.destination.label}</span></button>)}</div> : null}
    {activeLeg ? <div className="active-route-detail">
      <div className="mobility-route"><strong>{activeLeg.origin.label}</strong><NavigationArrow /><strong>{activeLeg.destination.label}</strong></div>
      <div className="mobility-summary"><b>{MOBILITY_MODE_LABELS[activeLeg.recommendedMode] ?? activeLeg.recommendedMode}</b><span>约 {recommended?.totalMinutes ?? "–"} 分钟</span>{recommended?.walkingMeters != null && <span>步行 {Math.round(recommended.walkingMeters)} 米</span>}{recommended?.transfers != null && recommended.mode === "transit" && <span>{recommended.transfers} 次换乘</span>}{recommended?.estimatedFareCny != null && recommended.mode === "taxi" && <span>估价 ¥{recommended.estimatedFareCny}</span>}</div>
      <div className="route-facility-section"><h4>这段路可参考的设施</h4><FacilityReferences facilities={features} emptyText="这段路线没有返回电梯、扶梯、楼梯或坡道资料；不代表现场没有。" /></div>
      <p>{activeLeg.rationale}</p>
      {recommended?.steps?.length ? <details><summary>查看上车、换乘和步行</summary><ol>{recommended.steps.map((step, index) => <li key={`${activeLeg.legId}-${index}`}><strong>{step.line || MOBILITY_MODE_LABELS[step.kind] || "路段"}</strong><span>{step.instruction}</span>{step.accessibilityFeatures?.length ? <small className="step-facility">{step.accessibilityFeatures.map((feature) => feature.label).join("、")} · 地图路线资料，非实时，现场确认</small> : null}</li>)}</ol></details> : null}
      {recommended?.navigationUrl && <a className="route-navigation-link" href={recommended.navigationUrl} target="_blank" rel="noreferrer"><NavigationArrow />在高德继续导航</a>}
    </div> : null}
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

function PlanCanvas({ conversation, trip, plan, tripRecovery, dataUnavailable, onRefresh, onRetryResearch, onRecoverTrip, onAcceptProposal, onRejectProposal, onPrefill, activeMobileView, onMobileViewChange, loading }) {
  const items = useMemo(() => Object.entries(plan?.byDomain ?? {}).flatMap(([domain, nodes]) => nodes.filter((node) => node.selected).map((node) => ({ ...node, domain }))), [plan]);
  const proposal = plan?.pendingProposals?.[0] ?? null;
  const proposalCandidates = useMemo(() => proposal ? DOMAIN_ITEMS.flatMap(({ key }) => (proposal.byDomain?.[key] ?? []).map((node) => ({ ...node, domain: key }))) : [], [proposal]);
  const workspaceNodes = items.length ? items : proposalCandidates;
  const [selections, setSelections] = useState({});
  const [detailNodeId, setDetailNodeId] = useState(null);
  const [activeLegId, setActiveLegId] = useState(null);
  useEffect(() => {
    if (!proposal) return setSelections({});
    setSelections(Object.fromEntries(DOMAIN_ITEMS.map(({ key }) => {
      const candidates = proposal.byDomain?.[key] ?? [];
      const explicit = candidates.find((candidate) => candidate.selected)?.nodeId;
      if (explicit) return [key, explicit];
      return [key, null];
    }).filter(([, nodeId]) => nodeId)));
  }, [proposal?.proposalId]);
  useEffect(() => {
    if (detailNodeId && !workspaceNodes.some((node) => node.nodeId === detailNodeId)) setDetailNodeId(null);
  }, [workspaceNodes, detailNodeId]);
  useEffect(() => {
    const legs = plan?.mobility?.legs ?? [];
    if (!legs.some((leg) => leg.legId === activeLegId)) setActiveLegId(legs[0]?.legId ?? null);
  }, [plan?.mobility, activeLegId]);
  const detailNode = workspaceNodes.find((node) => node.nodeId === detailNodeId) ?? null;
  return <section className={`trip-workspace mobile-mode-${activeMobileView}`} id="trip-plan-canvas">
    {!trip ? tripRecovery ? <div className="workspace-empty recovery-launchpad">
      <div className="recovery-card"><span className="recovery-icon"><ArrowsClockwise weight="bold" /></span><span className="eyebrow">继续这段对话</span><h2>旅行要求还在，草案需要重新建立</h2><p>这段历史对话保存完整，但原来的旅行草案已经丢失。重新建立后，助手会沿用你说过的目的地、同行人和偏好，不需要从头填写。</p><button className="button primary" type="button" onClick={onRecoverTrip} disabled={loading}>{loading ? <CircleNotch className="spin" /> : <ArrowsClockwise />}恢复并继续规划</button><small>不会自动确认、购买或覆盖其他旅行。</small></div>
      <div className="launchpad-preview"><span className="eyebrow">恢复后会出现</span><div className="launch-domain-grid">{DOMAIN_ITEMS.map(({ key, label, icon: Icon }) => <div key={key}><Icon weight="duotone" /><strong>{label}</strong><span>{key === "transport" ? "路线与换乘" : key === "stay" ? "位置与住宿" : key === "food" ? "本地餐饮" : "体验与节奏"}</span></div>)}</div><p><MapTrifold />地图、地点图片、路线和设施会与候选一起出现。</p></div>
    </div> : <div className="workspace-empty planning-launchpad">
      <section className="launchpad-copy"><span className="eyebrow">从一句话到可确认方案</span><h2>{conversation?.messages?.length ? "我已保留刚才的想法" : "先说最重要的，其他交给旅行助手"}</h2><p>{conversation?.messages?.length ? "继续补充或重新发送需求，助手会把吃、住、行、玩放进同一趟旅行，而不是让你先手工做行程。" : "有目的地就直接说；还没决定，也可以只描述假期、同行人和想要的感觉。"}</p><div className="launch-actions"><button type="button" onClick={() => { onPrefill("我想去……，时间是……，同行人有……"); onMobileViewChange("conversation"); }}><CalendarBlank /><span><strong>已有目的地和时间</strong><small>一句话开始规划</small></span></button><button type="button" onClick={() => { onPrefill("还没决定去哪。假期有……天，和……同行，希望……"); onMobileViewChange("conversation"); }}><Compass /><span><strong>帮我决定去哪</strong><small>先从期待和限制出发</small></span></button><button type="button" onClick={() => { onPrefill("这是我已有的旅行想法，请帮我整理并补全："); onMobileViewChange("conversation"); }}><List /><span><strong>整理已有想法</strong><small>粘贴零散攻略或安排</small></span></button></div></section>
      <section className="launchpad-preview"><span className="eyebrow">方案会这样形成</span><div className="launch-domain-grid">{DOMAIN_ITEMS.map(({ key, label, icon: Icon }) => <div key={key}><Icon weight="duotone" /><strong>{label}</strong><span>{key === "transport" ? "路线与换乘" : key === "stay" ? "位置与住宿" : key === "food" ? "本地餐饮" : "体验与节奏"}</span></div>)}</div><div className="launch-map-preview"><MapTrifold weight="duotone" /><div><strong>地图和行程同步出现</strong><p>候选、图片、路线、卫生间和电梯等设施资料会放在一起比较。</p></div></div><div className="launch-proof"><CheckCircle weight="fill" />只在你确认后加入旅行</div></section>
    </div> : <>
      <section className="itinerary-pane" aria-label="旅行安排">
        <div className="canvas-topline"><div><span className="eyebrow">行程</span><h2>{trip.destination || "目的地待补充"}</h2></div><button className="quiet-button" onClick={onRefresh} disabled={loading}><ArrowsClockwise />刷新</button></div>
        <div className="trip-brief-bar">{tripBriefChips(trip).map((chip) => <button key={chip.key} type="button" className={chip.missing ? "missing" : ""} onClick={() => { onPrefill(chip.prompt); onMobileViewChange("conversation"); }}>{chip.key === "dates" ? <CalendarBlank /> : chip.key === "pace" ? <PersonSimpleWalk /> : <MapPin />}<span>{chip.label}</span>{chip.missing && <small>补充</small>}</button>)}</div>
        {!proposal ? <PlanNextStep trip={trip} plan={plan} onPrefill={onPrefill} onMobileViewChange={onMobileViewChange} /> : null}
        <details className="planning-context"><summary>预算、同行人和天气</summary><TravelerCareSummary trip={trip} /><WeatherPlanningCard weather={plan?.weather} /></details>
        <div className="domain-coverage compact">{DOMAIN_ITEMS.map(({ key, label, icon: Icon }) => { const acceptedCount = plan?.byDomain?.[key]?.filter((node) => node.selected).length ?? 0; const pendingCount = proposal?.byDomain?.[key]?.length ?? 0; return <div key={key} className={acceptedCount || pendingCount ? "covered" : ""}><Icon weight="duotone" /><span>{label}</span><small>{acceptedCount ? "已选" : pendingCount ? `${pendingCount} 个候选` : "待研究"}</small></div>; })}</div>
        {proposal ? <ProposalPanel proposal={proposal} selections={selections} onSelect={(domain, nodeId) => setSelections((current) => ({ ...current, [domain]: nodeId }))} onPreviewCandidate={setDetailNodeId} onAccept={onAcceptProposal} onReject={onRejectProposal} loading={loading} /> : items.length ? <>
          <div className="accepted-heading"><div><span className="eyebrow">已经选好</span><h3>先看概览，需要时再展开详情</h3></div><span>仍可通过对话调整</span></div>
          <div className="journey-card-grid">{items.map((item, index) => { const meta = domainMeta(item.domain); const Icon = meta.icon; return <article key={item.nodeId} className="journey-card">{item.media?.[0] ? <img src={item.media[0].url} alt={item.media[0].title || `${item.title}实景图`} loading="lazy" referrerPolicy="no-referrer" /> : <div className="journey-card-no-media"><Icon weight="duotone" /></div>}<div className="journey-card-copy"><span><Icon weight="duotone" />{meta.label} · 第 {index + 1} 项</span><h4>{item.title}</h4><p>{item.summary || "待补充说明"}</p><small><Clock />{scheduleLabel(item)}</small><em>{acceptedSourceLabel(item)}</em></div><footer><button type="button" onClick={() => setDetailNodeId(item.nodeId)}><MapTrifold />查看照片、地图与设施</button></footer></article>; })}</div>
          <PlanQualityNotice qa={plan?.qa} />
          <MobilityPlanningCard mobility={plan?.mobility} activeLegId={activeLegId} onSelectLeg={setActiveLegId} />
        </> : dataUnavailable ? <div className="canvas-empty blocked-research"><WarningCircle weight="duotone" /><h3>暂时找不到实时地点资料</h3><p>你的旅行要求已经记住了。等资料恢复后再继续查找，之前说过的内容不用重来。</p><button className="button retry" onClick={onRetryResearch} disabled={loading}><ArrowsClockwise />重新查找旅行方案</button></div> : <div className="canvas-empty"><Sparkle weight="duotone" /><h3>还差一点旅行信息</h3><p>继续在对话中补充。助手只会追问真正影响方案的问题。</p></div>}
      </section>
    </>}
    <PlaceDetailSheet node={detailNode} plan={plan} tripId={trip?.tripId} onClose={() => setDetailNodeId(null)} />
    {conversation?.messages?.some((message) => message.role === "status" && message.kind?.includes("model")) && <div className="canvas-warning workspace-warning"><WarningCircle weight="fill" /><div><strong>旅行助手暂时无法回应</strong><p>你的需求会保留，服务恢复后可以从这里继续。</p></div></div>}
  </section>;
}

function ConversationPicker({ conversations, activeId, unavailableTripIds, onPick, onNew }) {
  return <aside className="conversation-picker"><div><span className="eyebrow">你的旅行对话</span><h2>继续编辑</h2></div><button className="new-chat" onClick={onNew}><Plus />新对话</button><div className="conversation-list">{conversations.length ? conversations.map((conversation) => {
    const needsRecovery = conversation.tripId && unavailableTripIds?.has(conversation.tripId);
    return <button key={conversation.conversationId} onClick={() => onPick(conversation.conversationId)} className={conversation.conversationId === activeId ? "active" : ""}><strong>{conversation.messages.find((message) => message.role === "user")?.text || "新的旅行想法"}</strong><span className="conversation-meta"><small className={needsRecovery ? "needs-recovery" : ""}>{needsRecovery ? "草案需恢复" : conversation.tripId ? "已建立旅行草案" : "等待旅行需求"}</small><time>{formatConversationRecency(conversation.updatedAt)}</time></span></button>;
  }) : <p>还没有对话。</p>}</div></aside>;
}

function TravelEditor({ session, onLogout }) {
  const [conversations, setConversations] = useState([]);
  const [conversation, setConversation] = useState(null);
  const [draft, setDraft] = useState("");
  const [pendingText, setPendingText] = useState("");
  const [trip, setTrip] = useState(null);
  const [plan, setPlan] = useState(null);
  const [tripRecovery, setTripRecovery] = useState(null);
  const [unavailableTripIds, setUnavailableTripIds] = useState(() => new Set());
  const [providerStatus, setProviderStatus] = useState(null);
  const [selectedModelId, setSelectedModelId] = useState("");
  const [mobileView, setMobileView] = useState("conversation");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [status, setStatus] = useState({ loading: true });
  const [paneLayout, setPaneLayout] = useState(storedPaneLayout);
  const scrollerRef = useRef(null);
  useEffect(() => {
    try {
      window.localStorage.setItem("travel-agent-pane-layout-v1", JSON.stringify(paneLayout));
    } catch {
      // Embedded clients may disable persistent storage; resizing still works for the current session.
    }
  }, [paneLayout]);
  const resizePane = useCallback((key, event, minimum, maximum) => {
    if (event.button !== 0) return;
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = paneLayout[key];
    const boundedMaximum = Math.max(minimum, maximum);
    document.body.classList.add("resizing-pane");
    const move = (nextEvent) => setPaneLayout((current) => ({ ...current, [key]: clamp(startWidth + nextEvent.clientX - startX, minimum, boundedMaximum) }));
    const stop = () => {
      document.body.classList.remove("resizing-pane");
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", stop);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop, { once: true });
    window.addEventListener("pointercancel", stop, { once: true });
  }, [paneLayout]);
  const nudgePane = useCallback((key, delta, minimum, maximum) => {
    setPaneLayout((current) => ({ ...current, [key]: clamp(current[key] + delta, minimum, Math.max(minimum, maximum)) }));
  }, []);
  const refreshConversations = useCallback(async () => {
    const [result, tripList] = await Promise.all([api.listConversations(), api.listTrips()]);
    const availableTripIds = new Set((tripList.trips ?? []).map((item) => item.tripId));
    setUnavailableTripIds(new Set(result.conversations.map((item) => item.tripId).filter((tripId) => tripId && !availableTripIds.has(tripId))));
    setConversations(result.conversations);
    return result.conversations;
  }, []);
  const loadTrip = useCallback(async (tripId) => {
    if (!tripId) { setTrip(null); setPlan(null); setTripRecovery(null); return false; }
    try {
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
      setTripRecovery(null);
      return true;
    } catch (error) {
      if (error.code !== "trip_not_found") throw error;
      setTrip(null);
      setPlan(null);
      setTripRecovery({ tripId });
      return false;
    }
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
      const loaded = await loadTrip(selected.tripId);
      setMobileView(loaded ? "itinerary" : "conversation");
      setHistoryOpen(false);
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
      setConversation(created); setTrip(null); setPlan(null); setTripRecovery(null); setDraft(""); setMobileView("conversation"); setHistoryOpen(false);
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
      const resultTripId = result.tripId ?? result.conversation.tripId;
      await loadTrip(resultTripId);
      if (resultTripId) setMobileView("itinerary");
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
  const quickReplies = quickRepliesForTrip(trip);
  return <main className="editor-shell">
    <header className="editor-topbar"><button className="history-button" type="button" onClick={() => setHistoryOpen(true)} aria-label="打开旅行对话记录"><ChatsCircle weight="duotone" /><span>对话记录</span></button><div className="brand"><MapPin weight="fill" /> Travel Agent</div><div className="topbar-copy"><span>{trip?.destination || "旅行助手"}</span><small>{trip ? `${trip.dates || (trip.durationDays ? `${trip.durationDays} 天` : "时间待补")} · ${trip.travelerCount} 人` : "从一句话到可确认方案"}</small></div><nav className="mobile-workspace-tabs" aria-label="旅行工作区"><button type="button" className={mobileView === "conversation" ? "active" : ""} onClick={() => setMobileView("conversation")}><ChatsCircle />对话</button><button type="button" className={mobileView === "itinerary" ? "active" : ""} disabled={!trip} onClick={() => setMobileView("itinerary")}><List />行程</button></nav><div className="account-actions"><span>{session.displayName || SESSION_PROVIDER_LABELS[session.provider] || "旅行者"}</span><button className="icon-button" onClick={onLogout} aria-label="退出登录"><SignOut /></button></div></header>
    {historyOpen ? <div className="history-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setHistoryOpen(false); }}><div className="history-drawer" role="dialog" aria-modal="true" aria-label="旅行对话记录"><button className="history-close icon-button" type="button" onClick={() => setHistoryOpen(false)} aria-label="关闭旅行对话记录"><X /></button><ConversationPicker conversations={conversations} activeId={conversation?.conversationId} unavailableTripIds={unavailableTripIds} onPick={selectConversation} onNew={createConversation} /></div></div> : null}
    <div className="editor-layout" style={{ "--sessions-width": `${paneLayout.sessions}px`, "--conversation-width": `${paneLayout.conversation}px` }}>
      <ConversationPicker conversations={conversations} activeId={conversation?.conversationId} unavailableTripIds={unavailableTripIds} onPick={selectConversation} onNew={createConversation} />
      <ResizeHandle className="session-resizer" label="调整对话记录宽度" onPointerDown={(event) => resizePane("sessions", event, 200, 340)} onNudge={(delta) => nudgePane("sessions", delta, 200, 340)} />
      <section className={`conversation-panel ${mobileView !== "conversation" ? "mobile-hidden" : ""}`}>
        <header className="conversation-header"><div><span className="eyebrow">旅行对话</span><h2>{trip ? "继续完善这趟旅行" : tripRecovery ? "恢复这趟旅行" : "描述你的旅行想法"}</h2></div>{trip ? <span className="draft-state"><CheckCircle weight="fill" />已记住旅行要求</span> : tripRecovery ? <span className="draft-state recovery"><ArrowsClockwise />草案需恢复</span> : <span className="draft-state muted">从一句话开始</span>}</header>
        {status.error && <div className="chat-error" role="alert"><WarningCircle />{status.error}<button onClick={() => setStatus({})}>关闭提示</button></div>}
        <div className="message-scroller" ref={scrollerRef}>{!conversation?.messages?.length ? pendingText && status.loading ? <><article className="chat-message user pending"><div className="message-avatar">你</div><div className="message-copy"><MessageBody text={pendingText} /><time>正在发送</time></div></article><ThinkingMessage /></> : <ConversationIntro onPrompt={(prompt) => submitMessage(prompt)} /> : <>{conversation.messages.map((message) => <MessageBubble key={message.messageId} message={message} />)}{status.loading && <ThinkingMessage />}<ActivityStrip activities={status.activities} /></>}</div>
        {trip && quickReplies.length ? <div className="quick-replies" aria-label="快捷调整旅行要求">{quickReplies.map((reply) => <button key={reply.label} type="button" disabled={status.loading} onClick={() => reply.prefill ? setDraft(reply.prefill) : submitMessage(reply.text)}>{reply.label}</button>)}</div> : null}
        <Composer value={draft} onChange={setDraft} onSubmit={submitMessage} loading={status.loading} />
      </section>
      <ResizeHandle className="workspace-resizer" label="调整对话与方案宽度" onPointerDown={(event) => resizePane("conversation", event, 340, Math.min(720, window.innerWidth - paneLayout.sessions - 520))} onNudge={(delta) => nudgePane("conversation", delta, 340, Math.min(720, window.innerWidth - paneLayout.sessions - 520))} />
      <PlanCanvas conversation={conversation} trip={trip} plan={plan} tripRecovery={tripRecovery} dataUnavailable={providerStatus?.data?.amapOfficialMcp === "blocked" && !["available_read_only", "trial_read_only"].includes(providerStatus?.data?.fliggyFlyAi) && providerStatus?.data?.tuniuOfficialMcp !== "available_read_only"} onRefresh={() => loadTrip(conversation?.tripId).catch((error) => setStatus({ error: messageError(error) }))} onRetryResearch={() => submitMessage("继续规划，请重新查找吃、住、行、玩方案。") } onRecoverTrip={() => submitMessage("请根据这段对话中已经说明的旅行要求，重新建立旅行草案并继续规划吃、住、行、玩。") } onAcceptProposal={acceptProposal} onRejectProposal={rejectProposal} onPrefill={setDraft} activeMobileView={mobileView} onMobileViewChange={setMobileView} loading={status.loading} />
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
