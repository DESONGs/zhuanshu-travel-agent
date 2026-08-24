import { createContext, lazy, Suspense, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import {
  AppleLogo, ArrowsClockwise, Baby, BatteryCharging, CalendarBlank, CaretDown, CheckCircle, ChatsCircle, CircleNotch,
  Clock, CloudSun, Compass, CurrencyCircleDollar, Elevator, ForkKnife, GoogleLogo, Heart, House, List, MapPin,
  ImageSquare, LinkSimple, MapTrifold, Microphone, NavigationArrow, PaperPlaneRight, PersonSimpleWalk, Plus, QrCode, SignOut, Sparkle,
  Stairs, StopCircle, Toilet, Train, WarningCircle, WechatLogo, Wheelchair, X,
} from "@phosphor-icons/react";
import { api } from "./api-client.js";
const LazyTripDecisionMap = lazy(() => import("./trip-map-explorer.jsx").then((module) => ({ default: module.TripDecisionMap })));

const DOMAIN_ITEMS = [
  { key: "play", label: "玩", icon: Compass },
  { key: "food", label: "吃", icon: ForkKnife },
  { key: "stay", label: "住", icon: House },
  { key: "transport", label: "行", icon: Train },
];
const STARTER_PROMPTS_ZH = [
  { title: "带家人轻松旅行", detail: "分别考虑体力、步行和住宿位置", text: "国庆和父母去大理 5 天，轻松一点，住得方便，想吃本地菜。", icon: PersonSimpleWalk },
  { title: "第一次探索一座城", detail: "把兴趣、路线和落脚点放在一起", text: "第一次来上海 3 天，想兼顾建筑、咖啡和适合步行的路线。", icon: Compass },
  { title: "先控制整趟预算", detail: "比较住宿、交通和体验的取舍", text: "两个人去北京看秋色，预算 8000，交通尽量少换乘。", icon: CurrencyCircleDollar },
];
const STARTER_PROMPTS_EN = [
  { title: "Take an easy family trip", detail: "Plan energy, walking and where to stay", text: "My parents and I have 5 relaxed days in Dali. We want an easy hotel location and local food.", icon: PersonSimpleWalk },
  { title: "Explore a city for the first time", detail: "Connect interests, routes and a stay anchor", text: "First time in Shanghai for 3 days. We like architecture, coffee and walkable routes.", icon: Compass },
  { title: "Set the whole-trip budget", detail: "Compare stays, transport and experiences", text: "Two people visiting Beijing in autumn, CNY 8,000 total, with as few transfers as possible.", icon: CurrencyCircleDollar },
];
const UiLocaleContext = createContext({ locale: "zh-CN", setLocale: () => {}, pick: (zh) => zh });

function initialUiLocale() {
  if (typeof window === "undefined") return "zh-CN";
  const requested = new URLSearchParams(window.location.search).get("lang");
  if (requested === "en" || requested === "en-US") return "en";
  if (requested === "zh" || requested === "zh-CN") return "zh-CN";
  const stored = window.localStorage.getItem("travel-agent-ui-locale");
  if (stored === "en" || stored === "zh-CN") return stored;
  return String(window.navigator.language || "zh-CN").toLowerCase().startsWith("zh") ? "zh-CN" : "en";
}

function useUiLocale() {
  return useContext(UiLocaleContext);
}

function TripDecisionMap(props) {
  const { pick } = useUiLocale();
  return <Suspense fallback={<div className="trip-map-loading" role="status"><MapTrifold weight="duotone" /><span><strong>{pick("正在载入地图", "Loading map")}</strong><small>{pick("地点与行程会保持同步", "Places and the trip stay in sync")}</small></span></div>}><LazyTripDecisionMap {...props} /></Suspense>;
}

function domainLabel(domain, locale = "zh-CN") {
  const labels = { play: ["玩", "Explore"], food: ["吃", "Eat"], stay: ["住", "Stay"], transport: ["行", "Move"] };
  return labels[domain]?.[locale === "en" ? 1 : 0] ?? domain;
}
const SESSION_PROVIDER_LABELS = { google: "Google", wechat: "微信", alipay: "支付宝", apple: "Apple", email_otp: "本地体验", guest: "临时旅行" };
const VISIT_TAG_LABELS = Object.freeze({
  local_character: "很有当地特色",
  worth_detour: "值得专程去",
  easy_to_reach: "位置好找",
  low_queue: "等待可接受",
  helpful_service: "沟通顺利",
  family_friendly: "适合同行家人",
  quiet_rest: "休息体验好",
  accurate_listing: "现场与资料相符",
  useful_facilities: "设施有帮助",
  foreigner_friendly: "入境游客较易使用",
  good_value: "花费合理",
  comfortable_pace: "节奏舒服",
});
const VISIT_TAGS_BY_DOMAIN = Object.freeze({
  food: ["local_character", "worth_detour", "low_queue", "helpful_service", "good_value", "foreigner_friendly"],
  play: ["local_character", "worth_detour", "easy_to_reach", "comfortable_pace", "family_friendly", "useful_facilities"],
  stay: ["easy_to_reach", "quiet_rest", "accurate_listing", "helpful_service", "useful_facilities", "foreigner_friendly"],
});

function formatTime(value, locale = "zh-CN") {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? (locale === "en" ? "Just now" : "刚刚") : new Intl.DateTimeFormat(locale === "en" ? "en-US" : "zh-CN", { hour: "2-digit", minute: "2-digit" }).format(date);
}

function formatConversationRecency(value, locale = "zh-CN") {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return locale === "en" ? "Updated just now" : "刚刚更新";
  const now = new Date();
  const sameDay = now.toDateString() === date.toDateString();
  return sameDay
    ? `${locale === "en" ? "Today" : "今天"} ${new Intl.DateTimeFormat(locale === "en" ? "en-US" : "zh-CN", { hour: "2-digit", minute: "2-digit" }).format(date)}`
    : new Intl.DateTimeFormat(locale === "en" ? "en-US" : "zh-CN", { month: "numeric", day: "numeric" }).format(date);
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function maxConversationPaneWidth(viewportWidth = typeof window === "undefined" ? 1440 : window.innerWidth) {
  if (viewportWidth <= 1180) return 720;
  // The trip history now lives in a drawer, so the conversation can be sized
  // against the actual trip workspace instead of reserving a permanent rail.
  return Math.min(560, Math.max(340, viewportWidth - 820));
}

function storedPaneLayout() {
  if (typeof window === "undefined") return { sessions: 236, conversation: 420 };
  try {
    const stored = JSON.parse(window.localStorage.getItem("travel-agent-pane-layout-v1") || "{}");
    const sessions = clamp(Number(stored.sessions) || 236, 200, 340);
    return {
      sessions,
      conversation: clamp(Number(stored.conversation) || 420, 340, maxConversationPaneWidth()),
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
    .replace(/\s*\+\s*/g, "、")
    .replace(/\s{2,}/g, " ")
    .trim();
  return cleaned || "旅行资料来源";
}

function tripBriefChips(trip, locale = "zh-CN") {
  if (!trip) return [];
  const en = locale === "en";
  return [
    { key: "destination", label: trip.destination || (en ? "Destination needed" : "目的地待补"), missing: !trip.destination, prompt: en ? "I want to add or change the destination: " : "我想补充目的地：" },
    { key: "dates", label: trip.dates || (trip.durationDays ? `${trip.durationDays} ${en ? "days" : "天"}` : (en ? "Dates needed" : "时间待补")), missing: !trip.dates && !trip.durationDays, prompt: en ? "My travel dates are: " : "我想补充旅行时间：" },
    { key: "travelers", label: en ? `${trip.travelerCount || 1} travelers` : `${trip.travelerCount || 1} 人同行`, missing: false, prompt: en ? "I want to update the travelers: " : "我想调整同行人：" },
    { key: "pace", label: trip.pace || (en ? "Pace needed" : "节奏待补"), missing: !trip.pace, prompt: en ? "The pace we want is: " : "我希望旅行节奏是：" },
    { key: "origin", label: trip.origin ? (en ? `From ${trip.origin}` : `${trip.origin}出发`) : (en ? "Origin needed" : "出发地待补"), missing: !trip.origin, prompt: en ? "We are departing from: " : "我从这里出发：" },
    { key: "budget", label: trip.totalBudget != null ? `${en ? "Budget" : "预算"} ¥${new Intl.NumberFormat(en ? "en-US" : "zh-CN").format(trip.totalBudget)}` : (en ? "Budget needed" : "预算待补"), missing: trip.totalBudget == null, prompt: en ? "Our total trip budget is: " : "这趟旅行的总预算是：" },
  ];
}

function quickRepliesForTrip(trip, locale = "zh-CN") {
  if (!trip) return [];
  const en = locale === "en";
  if (trip.totalBudget == null) return [
    { label: en ? "Location first" : "位置优先", text: en ? "Prioritize a convenient stay location; adjust the budget based on the time it saves." : "住宿位置优先，预算可以根据方便程度再权衡。" },
    { label: en ? "Stay under ¥500/night" : "住宿每晚 ¥500 内", text: en ? "Keep the stay budget under CNY 500 per night." : "住宿预算希望控制在每晚 500 元以内。" },
    { label: en ? "Stay ¥500-900/night" : "住宿每晚 ¥500-900", text: en ? "A stay budget of CNY 500 to 900 per night works for us." : "住宿预算可以接受每晚 500 到 900 元。" },
  ];
  if (!trip.origin) return [
    { label: en ? "Add departure city" : "补充出发地", prefill: en ? "We are departing from: " : "我从这里出发：" },
    { label: en ? "Plan destination first" : "暂不安排城际", text: en ? "Plan the stay, experiences, food and local transport first. Add intercity transport later." : "先规划目的地内的住宿、游玩、美食和当地交通，城际交通之后再补。" },
    { label: en ? "Fewer transfers" : "优先少换乘", text: en ? "Prioritize fewer transfers for intercity and local transport." : "城际和当地交通都优先少换乘。" },
  ];
  return [
    { label: en ? "Less walking" : "少走路", text: en ? "Reduce daily walking without changing unaffected confirmed plans." : "请在不改变已确认安排的前提下，让每天少走一点。" },
    { label: en ? "Location first" : "位置优先", text: en ? "Prefer stay and food locations that keep the route direct." : "住宿和餐饮优先选择更顺路的位置。" },
    { label: en ? "Lower the cost" : "控制预算", text: en ? "Compare a lower-cost version that does not clearly increase physical effort." : "请比较一版更节省预算、但不明显增加体力负担的方案。" },
  ];
}

function messageError(error) {
  const messages = {
    authentication_required: "登录会话已失效，请重新登录。",
    guest_trip_expired: "这次临时旅行已经过期。登录后可以长期保存新的旅行。",
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

function LoginScreen({ onSession, developmentAuthEnabled, providerStatus, initialError, onContinue = null, embedded = false }) {
  const { locale, pick } = useUiLocale();
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
      setStatus({ error: error.code === "auth_provider_not_configured" ? pick("生产登录尚未配置。本地开发环境需要显式开启开发会话。", "Production sign-in is not configured. Local development sessions must be enabled explicitly.") : pick("无法创建会话，请检查服务配置。", "The session could not be created. Check the service configuration.") });
    }
  };
  const providerCopy = (provider) => provider.id === "google" ? pick("使用 Google 继续", "Continue with Google") : provider.id === "wechat" ? pick("微信扫码登录", "Sign in with WeChat") : provider.id === "alipay" ? pick("支付宝扫码登录", "Sign in with Alipay") : pick("使用 Apple 登录", "Continue with Apple");
  return <main className={`auth-shell ${embedded ? "auth-modal-shell" : ""}`} role={embedded ? "dialog" : undefined} aria-modal={embedded ? "true" : undefined} aria-label={embedded ? pick("登录并保存旅行", "Sign in and save this trip") : undefined}>
    {embedded ? <button className="auth-modal-close icon-button" type="button" onClick={onContinue} aria-label={pick("继续临时使用", "Continue as guest")}><X /></button> : <section className="auth-visual" aria-hidden="true"><img src="/assets/login-travelers-waterfront.png" alt="" /></section>}
    <section className="auth-panel">
      <div className="brand"><MapPin weight="fill" /> Travel Agent</div>
      <h1>{embedded ? locale === "en" ? <>Save this trip.<br />Keep using it in China.</> : <>保存这趟旅行，<br />在中国继续使用。</> : locale === "en" ? <>Start a trip<br />with one sentence.</> : <>把一趟旅行，<br />从一句话开始。</>}</h1>
      <p>{embedded ? pick("登录后会把当前临时旅行和对话完整归入账号，可跨设备继续；不会把证件、支付或第三方凭据交给旅行 Agent。", "Signing in moves this guest trip and conversation into your account for cross-device access. Travel documents, payment data and third-party credentials are never given to the Agent.") : pick("告诉旅行 Agent 目的地、时间、同行人或一句模糊的期待；它会先理解，再联动研究吃、住、行、玩。", "Tell the Agent your destination, dates, travelers, or even a rough expectation. It will understand first, then research the trip as one connected plan.")}</p>
      <section className="auth-options" aria-label={pick("选择登录方式", "Choose a sign-in method")}>
        {status?.error && <p className="form-error" role="alert"><WarningCircle /> {status.error}</p>}
        {LOGIN_PROVIDERS.filter((provider) => provider.primary).map((provider) => {
          const Icon = provider.icon;
          const available = availableById.get(provider.id)?.available === true;
          return <button key={provider.id} className="auth-provider primary-provider" onClick={() => startLogin(provider)} disabled={!available}><Icon weight="bold" /><span>{providerCopy(provider)}</span>{!available && <em>{pick("待开放", "Not available")}</em>}</button>;
        })}
        <div className="auth-provider-grid">{LOGIN_PROVIDERS.filter((provider) => !provider.primary).map((provider) => {
          const Icon = provider.icon;
          const available = availableById.get(provider.id)?.available === true;
          return <button key={provider.id} className={`auth-provider ${provider.id}`} onClick={() => startLogin(provider)} disabled={!available}><Icon weight={provider.id === "wechat" ? "fill" : "regular"} /><span>{provider.id === "wechat" ? pick("微信", "WeChat") : provider.id === "alipay" ? pick("支付宝", "Alipay") : provider.shortLabel}</span>{!available && <em>{pick("待开放", "Not available")}</em>}</button>;
        })}</div>
        <p className="qr-guidance">{pick("电脑端选择微信或支付宝后，会进入平台官方扫码页；手机端按平台授权流程继续。", "On desktop, WeChat and Alipay open their official QR authorization pages. On mobile, their platform authorization flow continues directly.")}</p>
        {!webLoginAvailable && !developmentAuthEnabled ? <div className="auth-unavailable"><WarningCircle weight="fill" /><div><strong>{pick("登录渠道正在配置", "Sign-in is being configured")}</strong><p>{pick("当前没有可用的登录方式，请稍后再试。", "No sign-in method is available yet. Please try again later.")}</p></div></div> : null}
      </section>
      {developmentAuthEnabled ? <form className="development-login" onSubmit={submit}>
        <div className="auth-divider"><span>{pick("本地开发", "Local development")}</span></div>
        <div className="local-mode"><strong>{pick("仅限本机体验", "This device only")}</strong><span>{pick("不会发送验证码，也不会冒充任何第三方账号。", "No verification code is sent and no third-party identity is simulated.")}</span></div>
        <label>{pick("怎么称呼你", "What should we call you?")}<input aria-label={pick("怎么称呼你", "What should we call you?")} value={identity} onChange={(event) => setIdentity(event.target.value)} maxLength={80} placeholder={pick("旅行者", "Traveler")} /></label>
        <button className="button primary" disabled={status?.loading}>{status?.loading ? <CircleNotch className="spin" /> : null}{pick("进入旅行助手", "Open Travel Agent")}</button>
      </form> : null}
      {onContinue ? <button type="button" className="continue-guest" onClick={onContinue}>{pick("暂不登录，继续这次临时旅行", "Keep using this guest trip")}</button> : null}
      <small>{pick("支付、证件、Cookie 与第三方账号凭据不会发送给旅行 Agent。预订只会准备跳转，不会替你购买或退改。", "Payment data, travel documents, cookies and third-party credentials are never sent to the Agent. Booking only prepares a handoff; the Agent cannot purchase, cancel or change a booking for you.")}</small>
    </section>
  </main>;
}

function MessageBody({ text }) {
  const { pick } = useUiLocale();
  const [expanded, setExpanded] = useState(false);
  const lines = String(text ?? "").split(/\n+/).filter((line, index, values) => line.trim() || (index > 0 && index < values.length - 1));
  const isLong = String(text ?? "").length > 560 || lines.length > 4;
  const visibleLines = !expanded && isLong
    ? (lines.length > 3 ? [lines[0], lines[1], lines.at(-1)] : lines)
    : lines;
  return <div className={`message-body ${isLong && !expanded ? "collapsed" : ""}`}>{visibleLines.map((line, index) => {
    const pieces = line.split(/(\*\*[^*]+\*\*)/g).filter(Boolean);
    return <span key={`${line}-${index}`} className="message-line">{pieces.map((piece, pieceIndex) => piece.startsWith("**") && piece.endsWith("**") ? <strong key={pieceIndex}>{piece.slice(2, -2)}</strong> : piece)}</span>;
  })}{isLong ? <button type="button" className="message-expand" onClick={() => setExpanded((current) => !current)}>{expanded ? pick("收起说明", "Show less") : pick("展开完整说明", "Show full explanation")}<CaretDown className={expanded ? "expanded" : ""} /></button> : null}</div>;
}

function MessageBubble({ message }) {
  const { locale, pick } = useUiLocale();
  if (message.role === "status") return <div className="conversation-status"><WarningCircle weight="fill" /><span>{message.text}</span></div>;
  return <article className={`chat-message ${message.role}`}>
    <div className="message-avatar" aria-hidden="true">{message.role === "user" ? pick("你", "You") : <Sparkle weight="fill" />}</div>
    <div className="message-copy">{message.kind === "multimodal_input" ? <span className="message-media-badge"><ImageSquare weight="fill" />{pick("包含一张临时旅行图片 · 原图未保存", "Included a temporary travel image · original not saved")}</span> : null}<MessageBody text={message.text} /><time>{message.role === "user" ? pick("你的需求", "Your request") : "Travel Agent"} · {formatTime(message.createdAt, locale)}</time></div>
  </article>;
}

function ThinkingMessage() {
  const { pick } = useUiLocale();
  return <article className="chat-message assistant typing" aria-live="polite" aria-label={pick("旅行助手正在理解需求并核验资料", "Travel Agent is understanding your request and checking sources")}><div className="message-avatar"><Sparkle weight="fill" /></div><div className="thinking-state"><div className="typing-dots"><i /><i /><i /></div><small>{pick("正在理解约束并核验真实资料，复杂行程通常需要 10-30 秒", "Understanding constraints and checking real sources. A complex trip usually takes 10-30 seconds.")}</small></div></article>;
}

function ConversationIntro({ onPrompt }) {
  const { locale, pick } = useUiLocale();
  const prompts = locale === "en" ? STARTER_PROMPTS_EN : STARTER_PROMPTS_ZH;
  return <section className="conversation-intro">
    <div className="conversation-intro-copy"><span className="intro-mark"><Sparkle weight="fill" /></span><div><h1>{pick("从一句话开始规划", "Start planning with one sentence")}</h1><p>{pick("说目的地、时间、同行人，或者先说你最在意什么。", "Share the destination, dates, travelers, or what matters most.")}</p></div></div>
    <div className="prompt-suggestions">{prompts.map(({ title, detail, text, icon: Icon }) => <button key={title} type="button" onClick={() => onPrompt(text)}><Icon weight="duotone" /><span><strong>{title}</strong><small>{detail}</small></span><NavigationArrow /></button>)}</div>
    <p className="intro-media-note"><ImageSquare weight="duotone" />{pick("也可以附上截图、菜单或已有行程，和问题一起发送。", "You can also attach a screenshot, menu or existing itinerary with your question.")}</p>
  </section>;
}

function imagePayload(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(Object.assign(new Error("image_read_failed"), { code: "image_read_failed" }));
    reader.onload = () => {
      const value = String(reader.result ?? "");
      resolve(value.includes(",") ? value.slice(value.indexOf(",") + 1) : value);
    };
    reader.readAsDataURL(file);
  });
}

function Composer({ value, onChange, onSubmit, loading, inputRef, contextLabel, onClearContext, onInspectImage, onLinkPrompt, imageAttachment, onRemoveImage, imageLoading = false }) {
  const { locale, pick } = useUiLocale();
  const fallbackInputRef = useRef(null);
  const resolvedInputRef = inputRef ?? fallbackInputRef;
  const recognitionRef = useRef(null);
  const imageInputRef = useRef(null);
  const [voiceState, setVoiceState] = useState("idle");
  const [voiceNotice, setVoiceNotice] = useState("");
  const speechRecognition = typeof window !== "undefined" ? window.SpeechRecognition || window.webkitSpeechRecognition : null;
  const toggleVoice = () => {
    if (voiceState === "listening") {
      recognitionRef.current?.stop();
      return;
    }
    if (!speechRecognition) {
      setVoiceNotice(pick("当前设备暂不支持语音转写，请使用键盘输入。", "Voice transcription is not available on this device. Please type instead."));
      return;
    }
    const recognition = new speechRecognition();
    recognition.lang = locale === "en" ? "en-US" : "zh-CN";
    recognition.continuous = false;
    recognition.interimResults = true;
    const base = value.trim();
    recognition.onstart = () => { setVoiceState("listening"); setVoiceNotice(pick("正在听，转写后可以修改再发送。", "Listening. You can edit the transcript before sending.")); };
    recognition.onresult = (event) => {
      const transcript = Array.from(event.results).map((result) => result[0]?.transcript ?? "").join("");
      onChange([base, transcript].filter(Boolean).join(base && transcript ? " " : ""));
    };
    recognition.onerror = (event) => {
      setVoiceState("idle");
      setVoiceNotice(event.error === "not-allowed" ? pick("没有取得麦克风权限，请在系统设置中允许后重试。", "Microphone access was not granted. Allow it in system settings and try again.") : pick("这次没有听清，可以重试或继续打字。", "I could not hear that clearly. Try again or continue typing."));
    };
    recognition.onend = () => { setVoiceState("idle"); setVoiceNotice((current) => current || pick("转写完成，可以修改后发送。", "Transcription complete. Edit it before sending if needed.")); };
    recognitionRef.current = recognition;
    recognition.start();
  };
  return <form className={`chat-composer ${contextLabel ? "has-context" : ""} ${imageAttachment ? "has-image" : ""}`} onSubmit={(event) => { event.preventDefault(); onSubmit(value); }}>
    {contextLabel ? <div className="composer-context" role="status"><span>{pick("正在补充", "Adding")} <strong>{contextLabel}</strong></span><button type="button" onClick={onClearContext}>{pick("取消", "Cancel")}</button></div> : null}
    {imageAttachment ? <div className="composer-image-preview"><img src={imageAttachment.previewUrl} alt={pick("待发送的旅行图片预览", "Travel image ready to send")} /><span><strong>{imageAttachment.name}</strong><small>{pick("会与这条消息一起交给旅行助手；原图不会保存", "Sent with this message; the original is not saved")}</small></span><button type="button" onClick={onRemoveImage} aria-label={pick("移除图片", "Remove image")}><X /></button></div> : null}
    <div className="composer-writing-head"><label htmlFor="travel-message">{pick("说说这趟旅行", "Describe this trip")}</label><small>{pick("Enter 发送，Shift + Enter 换行", "Enter to send, Shift + Enter for a new line")}</small></div>
    <textarea id="travel-message" ref={resolvedInputRef} value={value} onChange={(event) => onChange(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); onSubmit(value); } }} rows={1} maxLength={4_000} placeholder={pick("例如：国庆和父母去大理 5 天，轻松一点，住得方便，想吃本地菜。", "For example: First time in Shanghai for 4 days, two travelers, easy pace, CNY 9,000 total.")} />
    <div className="composer-footer">
      <input ref={imageInputRef} className="visually-hidden" type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) onInspectImage?.(file); }} />
      <div className="composer-media-actions"><button type="button" className="media-button" onClick={() => imageInputRef.current?.click()} disabled={loading || imageLoading} aria-label={pick("上传旅行截图或图片", "Upload a travel screenshot or image")}>{imageLoading ? <CircleNotch className="spin" /> : <ImageSquare weight="bold" />}<span>{pick("图片", "Image")}</span></button><button type="button" className="media-button" onClick={onLinkPrompt} disabled={loading || imageLoading} aria-label={pick("粘贴旅行分享链接", "Paste a travel share link")}><LinkSimple weight="bold" /><span>{pick("链接", "Link")}</span></button></div>
      <button type="button" className={`voice-button ${voiceState}`} onClick={toggleVoice} aria-label={voiceState === "listening" ? pick("停止语音输入", "Stop voice input") : pick("开始语音输入", "Start voice input")} aria-pressed={voiceState === "listening"}>{voiceState === "listening" ? <StopCircle weight="fill" /> : <Microphone weight="bold" />}</button>
      <span className="composer-privacy">{voiceNotice || (imageAttachment ? pick("请勿上传证件、支付信息或联系方式", "Do not upload identity, payment or contact information") : pick("语音会先转成文字，由你确认后再发送", "Voice is transcribed first so you can review it before sending."))}</span>
      <button className="send-button" aria-label={pick("发送旅行需求", "Send travel request")} disabled={loading || (!value.trim() && !imageAttachment)}>{loading ? <CircleNotch className="spin" /> : <PaperPlaneRight weight="fill" />}</button>
    </div>
  </form>;
}

function ActivityStrip({ activities }) {
  const { locale, pick } = useUiLocale();
  if (!activities?.length) return null;
  const labels = locale === "en"
    ? { interpret_visual_context: "Understanding the image with this trip", save_trip_understanding: "Trip requirements saved", research_trip_options: "Researching the connected trip", get_trip_control_view: "Trip requirements loaded", get_trip_plan_view: "Current plan loaded", accept_trip_change: "Plan confirmed", refresh_trip_mobility: "City movement checked", reject_trip_change: "Options dismissed", trip_readiness: "Travel readiness updated" }
    : { interpret_visual_context: "正在结合这趟旅行理解图片", save_trip_understanding: "已记住旅行要求", research_trip_options: "正在查找吃住行玩", get_trip_control_view: "已读取旅行要求", get_trip_plan_view: "已读取当前方案", accept_trip_change: "已确认方案", refresh_trip_mobility: "已核验城市内移动", reject_trip_change: "已放弃候选", trip_readiness: "已更新出发准备" };
  return <div className="activity-strip" aria-live="polite" aria-label={pick("本轮处理进度", "Progress for this request")}>{activities.map((activity, index) => <span key={`${activity.toolName}-${index}`} className={["provider_unavailable", "AUTH_REQUIRED", "ACCOUNT_LIMITED", "RATE_LIMITED", "SOURCE_UNAVAILABLE", "EMPTY_VERIFIED", "failed"].includes(activity.status) ? "warning" : ""}>{activity.toolName === "interpret_visual_context" && activity.status === "completed" ? pick("已结合图片理解这次需求", "Image understood in this request") : activity.toolName === "interpret_visual_context" && activity.status === "failed" ? pick("这次没有读完图片", "The image could not be read") : activity.toolName === "restore_trip_draft" ? activity.status === "recovered" ? pick("已恢复旅行草案", "Trip draft restored") : pick("旅行草案需要恢复", "Trip draft needs recovery") : activity.toolName === "research_trip_options" && ["provider_unavailable", "AUTH_REQUIRED", "SOURCE_UNAVAILABLE"].includes(activity.status) ? pick("没有取得实时地点资料", "Live place data was not available") : activity.toolName === "research_trip_options" && activity.status === "ACCOUNT_LIMITED" ? pick("地图资料暂时无法访问", "Map data is temporarily unavailable") : activity.toolName === "research_trip_options" && activity.status === "RATE_LIMITED" ? pick("实时资料请求较多，请稍后再试", "Live sources are busy. Try again shortly.") : activity.toolName === "research_trip_options" && activity.status === "EMPTY_VERIFIED" ? pick("暂未找到可靠地点资料", "No reliable place result yet") : activity.toolName === "refresh_trip_mobility" && activity.status === "provider_unavailable" ? pick("城市路线资料暂不可用", "City routing is temporarily unavailable") : activity.toolName === "refresh_trip_mobility" && activity.status === "needs_context" ? pick("确认更多地点后再核验路线", "Confirm more places before routing") : `${labels[activity.toolName] ?? pick("正在处理旅行要求", "Working on the trip")}${activity.status === "proposed" ? pick("，可以在方案中比较", "; ready to compare") : ""}`}</span>)}</div>;
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

function compactDateTime(value) {
  const raw = String(value ?? "").trim();
  const match = raw.match(/(?:20\d{2}-)?(\d{1,2})-(\d{1,2})[ T](\d{1,2}:\d{2})/);
  return match ? `${Number(match[1])}月${Number(match[2])}日 ${match[3]}` : raw || "待核验";
}

function TransportSnapshot({ detail, compact = false }) {
  if (!detail || !["FLIGHT", "TRAIN"].includes(detail.transportType)) return null;
  const departure = detail.departurePlace;
  const arrival = detail.arrivalPlace;
  const fareOffers = detail.fareOffers ?? [];
  const fareOptions = detail.fareOptions ?? [];
  const routeReady = departure?.label || arrival?.label;
  return <section className={`transport-snapshot ${compact ? "compact" : "full"}`} aria-label="城际交通班次和票价">
    {routeReady ? <div className="transport-endpoints"><span><small>{compactDateTime(detail.departureAt)}</small><strong>{departure?.label || detail.departureCity || "出发点待核验"}</strong>{departure?.terminal ? <em>{departure.terminal}</em> : null}</span><NavigationArrow /><span><small>{compactDateTime(detail.arrivalAt)}</small><strong>{arrival?.label || detail.arrivalCity || "到达点待核验"}</strong>{arrival?.terminal ? <em>{arrival.terminal}</em> : null}</span></div> : null}
    <div className="transport-service-line"><span>{detail.transportType === "FLIGHT" ? "航班" : "列车"} {detail.serviceNumber || "班次待核验"}</span>{detail.carrier ? <span>{detail.carrier}</span> : null}{detail.durationMinutes ? <span>约 {Math.floor(detail.durationMinutes / 60) ? `${Math.floor(detail.durationMinutes / 60)} 小时 ` : ""}{detail.durationMinutes % 60 ? `${detail.durationMinutes % 60} 分` : ""}</span> : null}{detail.vehicleModel ? <span>{detail.vehicleModel}</span> : null}</div>
    {fareOffers.length ? <div className="transport-fares">{fareOffers.slice(0, compact ? 2 : 4).map((offer) => <span key={`${offer.provider}-${offer.totalFare}`}><small>{consumerProviderLabel(offer.providerLabel)}</small><strong>¥{offer.totalFare}</strong>{!compact && (offer.baseFare || offer.taxes) ? <em>{offer.baseFare ? `票面 ¥${offer.baseFare}` : ""}{offer.taxes ? ` + 税费 ¥${offer.taxes}` : ""}</em> : null}</span>)}</div> : fareOptions.length ? <div className="transport-fares">{fareOptions.slice(0, compact ? 2 : 5).map((offer) => <span key={offer.seatClass}><small>{offer.seatClass}</small><strong>¥{offer.fare}</strong>{offer.availableSeats != null ? <em>{offer.availableSeats > 0 ? `可见 ${offer.availableSeats} 张` : "当前未见余票"}</em> : null}</span>)}</div> : null}
    {!compact ? <p className="transport-freshness">票价、余位、航站楼与站台可能变化；下单前需在对应供应方再次确认。到达后的市内接驳由高德路线另行核验。</p> : null}
  </section>;
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

const DISCOVERY_PRIORITIES = Object.freeze([
  { key: "local", label: "更在地", domains: ["food", "play"], prompt: "请重新比较当前候选：优先有独立来源或真实到访反馈支持的当地特色，不要只按热度判断；同时说明证据还缺什么。" },
  { key: "route", label: "少绕路", domains: ["food", "play", "stay", "transport"], prompt: "请结合已选住宿、游玩和交通，优先比较更顺路、少折返的候选，并说明预计移动代价。" },
  { key: "queue", label: "少排队", domains: ["food", "play"], prompt: "请优先比较预约或排队负担较低的候选；没有可靠等待资料时请明确标为待核验。" },
  { key: "inbound", label: "入境友好", domains: ["food", "play", "stay", "transport"], prompt: "请从入境游客角度比较当前候选，重点核验语言、支付、实名证件、导航和外宾住宿资格；未知项不要推断。" },
  { key: "food", label: "饮食与过敏", domains: ["food"], prompt: "请结合同行人的口味、过敏与忌口重新比较餐饮候选，并说明点菜、沟通和交叉污染方面仍需确认什么。" },
]);

function nodeDecisionEvidence(node, mobility = null) {
  if (!node) return { cues: [], unknowns: [], route: null };
  const detail = node.operability ?? {};
  const facilities = mappedFacilityLabels(detail);
  const feedback = node.visitFeedback;
  const cues = [];
  const unknowns = [];
  if (node.location?.coordinates) cues.push("位置已定位");
  else unknowns.push("地图位置待补");
  if (["verified", "verified_provider"].includes(node.sourceStatus)) cues.push("具名来源已核验");
  if (facilities.length) cues.push(`${facilities.length} 项设施地图参考`);
  else unknowns.push("设施资料待补");
  if (feedback?.experienceCount) cues.push(`${feedback.experienceCount} 次匿名到访反馈`);
  if (feedback?.topTags?.some((tag) => tag.key === "local_character")) cues.push("到访反馈提到当地特色");
  else if (["food", "play"].includes(node.domain)) unknowns.push("当地特色证据待补");
  if (Number.isFinite(node.cost) && node.cost > 0) cues.push(`参考价 ¥${new Intl.NumberFormat("zh-CN").format(node.cost)}`);
  if (node.domain === "stay") {
    if (node.foreignGuestEligible === true) cues.push("外宾住宿资格已核验");
    else if (node.foreignGuestEligible == null) unknowns.push("外宾住宿资格待核验");
  }
  if (node.domain === "food" && feedback?.typicalWaitMinutes == null && detail.waitMinutes == null) unknowns.push("排队时间待补");
  const leg = (mobility?.legs ?? []).find((candidate) => candidate.origin?.nodeId === node.nodeId || candidate.destination?.nodeId === node.nodeId) ?? null;
  const alternative = leg?.alternatives?.find((candidate) => candidate.mode === leg.recommendedMode) ?? null;
  const route = leg && alternative ? {
    label: `${leg.origin.label} → ${leg.destination.label}`,
    mode: MOBILITY_MODE_LABELS[leg.recommendedMode] ?? leg.recommendedMode,
    minutes: alternative.totalMinutes,
    walkingMeters: alternative.walkingMeters,
    transfers: alternative.transfers,
    rationale: leg.rationale,
  } : null;
  return { cues: cues.slice(0, 5), unknowns: unknowns.slice(0, 3), route };
}

function MapFocusSummary({ node, mobility, onPreview }) {
  if (!node) return null;
  const evidence = nodeDecisionEvidence(node, mobility);
  const location = node.location?.label || node.location?.district || "地点位置待补";
  return <section className="map-focus-card" aria-live="polite">
    <div className="map-focus-heading"><span><MapPin weight="fill" /></span><div><small>{domainMeta(node.domain).label} · 当前查看</small><strong>{node.title}</strong><p>{location}</p></div>{onPreview ? <button type="button" onClick={onPreview}>完整详情<CaretDown /></button> : null}</div>
    {evidence.route ? <div className="map-route-cue"><Train weight="duotone" /><span><strong>{evidence.route.label}</strong><small>{evidence.route.mode}，约 {evidence.route.minutes} 分钟{evidence.route.walkingMeters != null ? `，步行 ${Math.round(evidence.route.walkingMeters)} 米` : ""}{evidence.route.transfers != null ? `，${evidence.route.transfers} 次换乘` : ""}</small></span></div> : null}
    {evidence.cues.length ? <div className="decision-cues" aria-label="已有判断依据">{evidence.cues.map((cue) => <span key={cue}><CheckCircle weight="fill" />{cue}</span>)}</div> : null}
    {evidence.unknowns.length ? <div className="decision-unknowns"><span>待补证据</span>{evidence.unknowns.map((unknown) => <small key={unknown}>{unknown}</small>)}</div> : null}
  </section>;
}

function PlanNextStep({ trip, plan, onPrefill, onMobileViewChange }) {
  const { locale, pick } = useUiLocale();
  const steps = [];
  if (!hasSpecificTravelDates(trip?.dates)) steps.push({ key: "dates", title: pick("补充具体日期", "Add exact dates"), detail: pick("核验天气、房态和每天节奏", "Check weather, inventory and daily pace"), prompt: pick("我想补充具体旅行日期：", "My exact travel dates are: ") });
  if (!trip?.origin) steps.push({ key: "origin", title: pick("补充出发地", "Add departure city"), detail: pick("补齐城际交通和首末日衔接", "Connect intercity travel and the first/last day"), prompt: pick("我的出发地是：", "We are departing from: ") });
  if (!(plan?.byDomain?.food ?? []).some((node) => node.selected)) steps.push({ key: "food", title: pick("继续找本地菜", "Continue local food research"), detail: pick("把餐饮放进住宿和游玩动线", "Put food on the stay and activity route"), prompt: pick("请继续查找适合我们、顺路的本地菜和餐厅。", "Continue researching local food that fits us and stays on route.") });
  if (!steps.length) return null;
  return <section className="next-step-guide" aria-labelledby="next-step-title"><div><span className="eyebrow">{pick("接下来完成", "Next to complete")}</span><h3 id="next-step-title">{pick("先补最影响整趟旅行的信息", "Add the information that changes the trip most")}</h3></div><div className="next-step-actions">{steps.slice(0, 3).map((step, index) => <button key={step.key} type="button" onClick={() => { onPrefill(step.prompt); onMobileViewChange("conversation"); }}><span>{index + 1}</span><strong>{step.title}</strong><small>{step.detail}</small><NavigationArrow /></button>)}</div></section>;
}

function ProposalPanel({ proposal, trip, plan, selections, onSelect, onPreviewCandidate, onAskAgent, onFocusMap, onAccept, onReject, onClose, loading }) {
  const { locale, pick } = useUiLocale();
  const availableDomains = DOMAIN_ITEMS.filter(({ key }) => (proposal.byDomain?.[key]?.length ?? 0) > 0);
  const [activeDomain, setActiveDomain] = useState(availableDomains[0]?.key ?? DOMAIN_ITEMS[0].key);
  useEffect(() => {
    setActiveDomain(availableDomains[0]?.key ?? DOMAIN_ITEMS[0].key);
  }, [proposal.proposalId]);
  const currentDomain = availableDomains.find(({ key }) => key === activeDomain) ?? availableDomains[0] ?? DOMAIN_ITEMS[0];
  const candidates = proposal.byDomain?.[currentDomain.key] ?? [];
  const activeNodeId = selections[currentDomain.key] ?? candidates[0]?.nodeId ?? null;
  const activeNode = candidates.find((candidate) => candidate.nodeId === activeNodeId) ?? candidates[0] ?? null;
  const priorities = DISCOVERY_PRIORITIES.filter((priority) => priority.domains.includes(currentDomain.key));
  const selectedCount = availableDomains.filter(({ key }) => selections[key]).length;
  return <section className="proposal-panel" role="dialog" aria-modal="true" aria-labelledby={`proposal-${proposal.proposalId}`}>
    <header className="proposal-heading"><div><h3 id={`proposal-${proposal.proposalId}`}>{proposal.title}</h3><p>{proposal.summary}</p></div><div className="proposal-heading-actions"><div className="proposal-source"><strong>{consumerProviderLabel(proposal.providerLabel)}</strong><span>{formatCheckedAt(proposal.checkedAt)}</span></div><button type="button" className="icon-button" onClick={onClose} aria-label={pick("关闭候选池", "Close candidate pool")}><X /></button></div></header>
    <div className="decision-tabs" role="tablist" aria-label="切换要决定的旅行内容">{availableDomains.map(({ key, label, icon: Icon }) => <button key={key} type="button" role="tab" aria-selected={currentDomain.key === key} className={currentDomain.key === key ? "active" : ""} onClick={() => setActiveDomain(key)}><Icon weight="duotone" /><span>{label}</span><small>{selections[key] ? "已选" : `${proposal.byDomain[key].length} 个可选`}</small></button>)}</div>
    <div className="discovery-priority-row"><span>优先考虑</span><div>{priorities.map((priority) => <button key={priority.key} type="button" onClick={() => onAskAgent(priority.prompt, priority.label)}>{priority.label}</button>)}</div><button className="agent-compare-button" type="button" onClick={() => onAskAgent(`请按我的旅行要求比较当前${currentDomain.label}候选：分别说明当地特色证据、同行人适配、预算、路线绕行、等待或预约负担、入境可操作性与来源可信度，最后推荐一个；未知项明确标出。`, `比较${currentDomain.label}候选`)}><Sparkle weight="fill" />让 Agent 替我比较</button></div>
    <section className="proposal-domain focused" aria-labelledby={`${proposal.proposalId}-${currentDomain.key}`}>
      <div className="domain-title"><span><currentDomain.icon weight="duotone" /></span><div><h4 id={`${proposal.proposalId}-${currentDomain.key}`}>选择一个{currentDomain.label}候选</h4><small>点击候选或地图标记进行选择；确认整份方案前不会写入行程</small></div></div>
      <div className="proposal-explorer-layout"><div className="candidate-list">{candidates.map((candidate) => {
        const detail = candidate.operability ?? {};
        const locationLabel = candidate.location?.district || candidate.location?.label;
        const facilities = mappedFacilityLabels(detail);
        const selected = selections[currentDomain.key] === candidate.nodeId;
        const decision = nodeDecisionEvidence({ ...candidate, domain: currentDomain.key });
        return <article key={candidate.nodeId} className={`candidate-option ${candidate.media?.[0] ? "has-photo" : "no-photo"} ${selected ? "selected" : ""}`}>
          <label><input type="radio" name={`${proposal.proposalId}-${currentDomain.key}`} checked={selected} onChange={() => onSelect(currentDomain.key, candidate.nodeId)} /><CandidatePhoto candidate={candidate} /><span className="radio-mark" aria-hidden="true" /><span className="candidate-copy"><strong>{candidate.title}</strong><span>{candidate.summary || "地点详情仍待补充核验。"}</span><small>{[locationLabel, detail.rating ? `评分 ${detail.rating}` : null, detail.priceHint ? `${currentDomain.key === "transport" ? "参考票价" : "参考消费"} ${detail.priceHint}` : null, detail.weatherFit === "preferred" ? "天气优先" : detail.weatherFit === "caution" ? "天气需备选" : null].filter(Boolean).join("，")}</small><TransportSnapshot detail={detail} compact />{facilities.length ? <em>设施参考：{facilities.join("、")}，非实时，现场确认</em> : null}{currentDomain.key === "stay" && detail.lodgingDataNature === "amap_place_reference" ? <em>高德提供酒店位置与基础资料；指定日期房态、房型和价格仍待 OTA 核验</em> : currentDomain.key === "stay" && detail.inventoryVerified === false ? <em>酒店参考候选；指定日期房态、房型、早餐、退改和外宾资格需在 OTA 跳转页核验</em> : null}</span></label>
          <div className="candidate-evidence-preview">{decision.cues.slice(0, 3).map((cue) => <span key={cue}>{cue}</span>)}{decision.unknowns.slice(0, 1).map((unknown) => <em key={unknown}>{unknown}</em>)}</div>
          <div className="candidate-links">
            <button type="button" onClick={() => onPreviewCandidate(candidate.nodeId)}><MapTrifold />查看照片和详情</button>
            {detail.navigationUrl && <a href={detail.navigationUrl} target="_blank" rel="noreferrer"><NavigationArrow />在高德查看</a>}
            {detail.bookingUrl && <a href={detail.bookingUrl} target="_blank" rel="noreferrer"><NavigationArrow />在{detail.bookingProviderLabel || "供应方"}查看</a>}
          </div>
        </article>;
      })}{!candidates.length && <p className="domain-empty">这一类暂时没有可靠候选，先保持待安排。</p>}</div><aside className="proposal-map-panel"><header><strong>地点分布与路线关系</strong><button type="button" onClick={onFocusMap}><MapTrifold />专注地图</button></header><TripDecisionMap nodes={candidates.map((candidate) => ({ ...candidate, domain: currentDomain.key }))} activeNodeId={activeNodeId} onFocusNode={(nodeId) => onSelect(currentDomain.key, nodeId)} tripId={trip?.tripId} staticMapAvailable={plan?.mapPreviewAvailable === true} label={`${currentDomain.label}候选地图`} locale={locale} /><MapFocusSummary node={activeNode ? { ...activeNode, domain: currentDomain.key } : null} onPreview={() => activeNode && onPreviewCandidate(activeNode.nodeId)} /></aside></div>
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

function VisitFeedbackSection({ node, onSubmit }) {
  const feedback = node.visitFeedback;
  const [formOpen, setFormOpen] = useState(false);
  const [kind, setKind] = useState("experience");
  const [verdict, setVerdict] = useState("recommend");
  const [tags, setTags] = useState([]);
  const [text, setText] = useState("");
  const [spendCny, setSpendCny] = useState("");
  const [waitMinutes, setWaitMinutes] = useState("");
  const [share, setShare] = useState(true);
  const [status, setStatus] = useState({});
  useEffect(() => {
    setFormOpen(false); setKind("experience"); setVerdict("recommend"); setTags([]); setText(""); setSpendCny(""); setWaitMinutes(""); setShare(true); setStatus({});
  }, [node.nodeId]);
  if (!VISIT_TAGS_BY_DOMAIN[node.domain]) return null;
  const total = feedback?.experienceCount ?? 0;
  const recommendCount = feedback?.recommendation?.recommend ?? 0;
  const toggleTag = (tag) => setTags((current) => current.includes(tag) ? current.filter((item) => item !== tag) : [...current, tag]);
  const submit = async (event) => {
    event.preventDefault();
    const clean = text.trim();
    if (clean.length < 4) return setStatus({ error: "请写一句能帮助下一位旅行者判断的真实情况。" });
    setStatus({ loading: true });
    try {
      await onSubmit({
        category: kind === "fact" ? "fact_correction" : "personal_experience",
        nodeId: node.nodeId,
        text: clean,
        visibility: share ? "anonymous_travelers" : "trip_only",
        ...(kind === "experience" ? {
          verdict,
          tags,
          ...(spendCny !== "" ? { spendCny: Number(spendCny) } : {}),
          ...(waitMinutes !== "" ? { waitMinutes: Number(waitMinutes) } : {}),
        } : {}),
      });
      setFormOpen(false); setText(""); setTags([]); setSpendCny(""); setWaitMinutes("");
      setStatus({ success: kind === "fact" ? "已记录为待核验信息，不会直接改写地点事实。" : share ? "已匿名加入到访参考，下一位旅行者会看到汇总。" : "已保存在这趟旅行中。" });
    } catch (error) {
      setStatus({ error: error?.code === "needs_rebase" ? "旅行方案刚刚更新，请关闭详情后重新打开再提交。" : "暂时没有保存成功，请稍后再试。" });
    }
  };
  return <section className="detail-section visit-feedback-section">
    <header><div><Heart weight="duotone" /></div><span><strong>到访者怎么说</strong><small>{total ? `${total} 次匿名到访反馈 · 只汇总结构化体验` : "还没有到访记录，你可以帮助下一位旅行者"}</small></span></header>
    {total ? <div className="visit-feedback-summary"><div className="visit-recommendation"><strong>{Math.round((recommendCount / total) * 100)}%</strong><span>愿意推荐<small>{recommendCount}/{total} 次到访</small></span></div><div className="visit-summary-facts">{feedback.typicalSpendCny != null ? <span><CurrencyCircleDollar />典型花费约 ¥{feedback.typicalSpendCny}</span> : null}{feedback.typicalWaitMinutes != null ? <span><Clock />典型等待约 {feedback.typicalWaitMinutes} 分钟</span> : null}</div>{feedback.topTags?.length ? <div className="visit-feedback-tags">{feedback.topTags.map((tag) => <span key={tag.key}>{VISIT_TAG_LABELS[tag.key] || tag.key}<small>{tag.count}</small></span>)}</div> : null}</div> : <p className="visit-feedback-empty">到访记录会回答“值不值得去、现场花费与等待怎样”，不会把个人感受冒充地点事实。</p>}
    {feedback?.pendingFactCheckCount ? <div className="visit-fact-warning"><WarningCircle weight="fill" /><span>近期有 {feedback.pendingFactCheckCount} 条现场变化报告正在核验，营业、价格或设施信息建议出发前再确认。</span></div> : null}
    {status.success ? <div className="visit-feedback-success"><CheckCircle weight="fill" />{status.success}</div> : null}
    {node.selected && !formOpen ? <button className="visit-feedback-open" type="button" onClick={() => { setStatus({}); setFormOpen(true); }}><Heart weight="fill" /><span><strong>我去过，留一条到访记录</strong><small>帮助下一位旅行者少做一点攻略</small></span><CaretDown /></button> : null}
    {node.selected && formOpen ? <form className="visit-feedback-form" onSubmit={submit}>
      <div className="visit-feedback-kind" role="tablist" aria-label="选择反馈类型"><button type="button" role="tab" aria-selected={kind === "experience"} className={kind === "experience" ? "active" : ""} onClick={() => setKind("experience")}>体验感受</button><button type="button" role="tab" aria-selected={kind === "fact"} className={kind === "fact" ? "active" : ""} onClick={() => setKind("fact")}>现场信息有变化</button></div>
      {kind === "experience" ? <><fieldset><legend>这次体验值得推荐吗？</legend><div className="visit-verdicts">{[["recommend", "值得推荐"], ["mixed", "看情况"], ["not_recommend", "不太推荐"]].map(([value, label]) => <label key={value} className={verdict === value ? "selected" : ""}><input type="radio" name={`verdict-${node.nodeId}`} value={value} checked={verdict === value} onChange={() => setVerdict(value)} />{label}</label>)}</div></fieldset><fieldset><legend>哪些感受最有帮助？</legend><div className="visit-tag-picker">{VISIT_TAGS_BY_DOMAIN[node.domain].map((tag) => <button type="button" key={tag} className={tags.includes(tag) ? "selected" : ""} aria-pressed={tags.includes(tag)} onClick={() => toggleTag(tag)}>{VISIT_TAG_LABELS[tag]}</button>)}</div></fieldset><div className="visit-number-fields"><label><span>{node.domain === "stay" ? "本次每晚花费" : "本次人均花费"}<small>可不填</small></span><input type="number" min="0" max="1000000" inputMode="decimal" value={spendCny} onChange={(event) => setSpendCny(event.target.value)} placeholder="¥" /></label>{node.domain !== "stay" ? <label><span>现场等待时间<small>可不填</small></span><input type="number" min="0" max="1440" inputMode="numeric" value={waitMinutes} onChange={(event) => setWaitMinutes(event.target.value)} placeholder="分钟" /></label> : null}</div></> : <p className="visit-fact-help">告诉我们搬迁、闭店、价格、支付、设施或营业时间等变化。系统只会标记“待核验”，不会直接改写地点资料。</p>}
      <label className="visit-note"><span>{kind === "fact" ? "现场发生了什么变化？" : "给下一位旅行者的一句话"}</span><textarea value={text} onChange={(event) => setText(event.target.value)} maxLength={600} placeholder={kind === "fact" ? "例如：入口已经搬到街道另一侧，原来的电梯口暂时关闭。" : "例如：本地菜很有特色，周末午餐等了约 25 分钟，带长辈建议提前到。"} /></label>
      <label className="visit-share"><input type="checkbox" checked={share} onChange={(event) => setShare(event.target.checked)} /><span><strong>匿名帮助下一位旅行者</strong><small>不会公开你的账号、同行人或完整行程；自由文字不会直接展示为公共事实。</small></span></label>
      {status.error ? <p className="visit-feedback-error" role="alert">{status.error}</p> : null}
      <footer><button type="button" className="quiet-action" onClick={() => { setFormOpen(false); setStatus({}); }}>取消</button><button type="submit" className="button primary" disabled={status.loading}>{status.loading ? <CircleNotch className="spin" /> : <PaperPlaneRight />}提交到访记录</button></footer>
    </form> : null}
  </section>;
}

function PlaceDetailSheet({ node, plan, tripId, onClose, onSubmitFeedback }) {
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
    detail.roomArea ? { label: "房间面积", value: detail.roomArea } : null,
    detail.roomWindow ? { label: "窗户", value: detail.roomWindow } : null,
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
        {node.domain === "transport" ? <section className="detail-section transport-detail"><header><div><Train weight="duotone" /></div><span><strong>班次、到达点与票价</strong><small>跨城库存来自 OTA；市内接驳由高德路线补齐</small></span></header><TransportSnapshot detail={detail} /></section> : null}
        <section className="detail-section location-detail"><header><div><MapTrifold weight="duotone" /></div><span><strong>{node.domain === "transport" ? "到达后的路线" : "位置与地图"}</strong><small>{node.domain === "transport" ? `${detail.arrivalPlace?.label || "到达点待核验"} → 住宿与首个行程点` : location}</small></span></header>{plan?.mapPreviewAvailable ? <TripMapPreview tripId={tripId} plan={plan} /> : <div className="detail-map-status"><MapPin weight="fill" /><span><strong>产品内地图暂时不可用</strong><small>{node.domain === "transport" ? "班次资料仍可比较；高德账户恢复后会把机场或车站接到住宿和首个行程点。" : "坐标和地址已保留；高德账户恢复后会补回地图、路线和出入口。"}</small></span></div>}{mapUrl ? <a className="detail-primary-link" href={mapUrl} target="_blank" rel="noreferrer"><NavigationArrow />在高德查看这个地点</a> : null}</section>
        <section className="detail-section facilities-detail"><header><div><Elevator weight="duotone" /></div><span><strong>设施与可达性</strong><small>{facilities.length ? "地图资料，非实时，建议现场确认" : "当前来源尚未返回设施资料"}</small></span></header><FacilityReferences facilities={facilities} emptyText={node.domain === "stay" ? "当前酒店来源只返回了图片、位置和参考价格；电梯、停车、早餐、卫生间等设施需要在酒店详情页继续核验。" : "当前来源没有返回卫生间、电梯、坡道或储物设施；不代表现场没有，出发前仍需核验。"} />{detail.indoorMap || detail.indoor ? <p className="facility-note">已取得室内或楼层相关资料；入口、楼层和开放情况仍以现场为准。</p> : null}{detail.bookingUrl ? <a className="detail-primary-link" href={detail.bookingUrl} target="_blank" rel="noreferrer"><NavigationArrow />在{detail.bookingProviderLabel || "供应方"}查看完整图片与设施</a> : null}</section>
        {["food", "play", "stay"].includes(node.domain) ? <VisitFeedbackSection node={node} onSubmit={onSubmitFeedback} /> : null}
        <section className="detail-source-note"><WarningCircle weight="fill" /><p>{acceptedSourceLabel(node)}。图片、价格、房态、营业状态和设施信息以跳转页或现场为准。</p></section>
      </div>
    </aside>
  </div>;
}

function WeatherPlanningCard({ weather, onEdit }) {
  if (!weather) return <section className="weather-card pending editable-weather"><CloudSun weight="duotone" /><div><strong>天气待核验</strong><p>生成方案时会先核验旅行日期与目的地天气，再安排户外体验、换乘缓冲、住宿和餐饮动线。</p></div><button type="button" onClick={() => onEdit?.("我想补充具体旅行日期：", "旅行日期")}>补充日期<PaperPlaneRight /></button></section>;
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
  const datePrompt = weather.coverage === "dates_unknown" || weather.coverage === "outside_forecast_window" ? "我想补充具体旅行日期：" : "我想调整旅行日期，目前计划是：";
  return <section className={`weather-card ${weather.planningImpact?.severity ?? "none"} editable-weather`}>
    <header><span><CloudSun weight="duotone" /></span><div><strong>{title}</strong><p>{weather.city || weather.destination}，{coverageLabel}{weather.reportTime ? `，${weather.reportTime} 发布` : ""}</p></div><button type="button" onClick={() => onEdit?.(datePrompt, "旅行日期与天气")}>{weather.coverage === "dates_unknown" ? "补充日期" : "调整日期"}<PaperPlaneRight /></button></header>
    {days.length ? <div className="weather-days">{days.map((day) => <div key={day.date}><small>{day.date.slice(5).replace("-", "/")}</small><strong>{day.dayCondition || "天气待定"}</strong><span>{day.highC ?? "-"}° / {day.lowC ?? "-"}°</span></div>)}</div> : null}
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
      <div className="mobility-summary"><b>{MOBILITY_MODE_LABELS[activeLeg.recommendedMode] ?? activeLeg.recommendedMode}</b><span>约 {recommended?.totalMinutes ?? "-"} 分钟</span>{recommended?.walkingMeters != null && <span>步行 {Math.round(recommended.walkingMeters)} 米</span>}{recommended?.transfers != null && recommended.mode === "transit" && <span>{recommended.transfers} 次换乘</span>}{recommended?.estimatedFareCny != null && recommended.mode === "taxi" && <span>估价 ¥{recommended.estimatedFareCny}</span>}</div>
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

function TravelerCareSummary({ trip, onEdit }) {
  const travelers = (trip?.travelers ?? []).map((traveler) => ({ ...traveler, labels: travelerCareLabels(traveler) }));
  const specific = travelers.filter((traveler) => traveler.labels.length || traveler.relationship || !/^同行人 \d+$/.test(traveler.displayName ?? ""));
  const facts = [
    { key: "budget", icon: CurrencyCircleDollar, title: trip?.totalBudget != null ? `总预算 ¥${new Intl.NumberFormat("zh-CN").format(trip.totalBudget)}` : "总预算待补", detail: "影响住宿、交通与餐饮取舍", prompt: trip?.totalBudget != null ? `我想调整这趟旅行的总预算，目前是 ¥${new Intl.NumberFormat("zh-CN").format(trip.totalBudget)}。新的预算是：` : "这趟旅行的总预算是：", missing: trip?.totalBudget == null },
    { key: "pace", icon: PersonSimpleWalk, title: trip?.pace ? `整体节奏：${trip.pace}` : "旅行节奏待补", detail: "影响每天强度、步行与休息", prompt: trip?.pace ? `我想调整整趟旅行的节奏，目前是“${trip.pace}”。希望改为：` : "我希望整趟旅行的节奏是：", missing: !trip?.pace },
  ].filter(Boolean);
  return <section className="traveler-care" aria-labelledby="traveler-care-title">
    <header><span><Heart weight="fill" /></span><div><strong id="traveler-care-title">同行人的安排重点</strong><p>点击预算、节奏或某位同行人，会回到对话输入；发送后 Agent 才会更新方案。</p></div></header>
    <div className="trip-fact-actions">{facts.map(({ key, icon: Icon, title, detail, prompt, missing }) => <button key={key} type="button" className={missing ? "missing" : ""} onClick={() => onEdit?.(prompt, key === "budget" ? "旅行预算" : "旅行节奏")}><span><Icon /></span><span><strong>{title}</strong><small>{detail}</small></span><CaretDown /></button>)}</div>
    {specific.length ? <ul>{specific.map((traveler) => {
      const name = traveler.displayName || traveler.relationship || "同行人";
      const existing = traveler.labels.length ? `目前已记录：${traveler.labels.join("、")}；` : "目前还没有额外行动要求；";
      return <li key={traveler.travelerId}><button type="button" className="traveler-edit-row" onClick={() => onEdit?.(`关于${name}的出行要求，${existing}我想补充或调整：`, `${name}的出行要求`)}><span className="traveler-copy"><span><strong>{name}</strong>{traveler.relationship && traveler.relationship !== traveler.displayName ? <em>{traveler.relationship}</em> : null}</span><small>{traveler.labels.length ? traveler.labels.join("，") : "暂无额外行动要求"}</small></span><span className="traveler-edit-label">补充或修改<CaretDown /></span></button></li>;
    })}</ul> : <button type="button" className="care-empty editable" onClick={() => onEdit?.("请分别记录同行人的行动需求，例如谁需要少走路、少换乘、固定休息或特定设施：", "同行人的出行要求")}>还没有分别记录同行人的行动需求<span>现在补充<CaretDown /></span></button>}
  </section>;
}

const READINESS_STATUS_LABELS = Object.freeze({
  ready: "已准备",
  action_required: "需要处理",
  needs_verification: "需要核验",
  blocked: "当前会阻断",
  not_applicable: "本次不适用",
});
const READINESS_STATUS_LABELS_EN = Object.freeze({
  ready: "Ready",
  action_required: "Action needed",
  needs_verification: "Check needed",
  blocked: "Blocks this trip",
  not_applicable: "Not needed",
});

function localizedReadinessItem(item, locale) {
  if (locale !== "en") return item;
  const copy = {
    trip_scope: ["Destination and dates", item.status === "ready" ? "Dates are specific enough to check routes and dated inventory." : "Destination or dates are missing, limiting weather, inventory and daily timing checks.", "Add destination and exact dates"],
    travel_documents: ["Entry and travel documents", "Only the check status is stored. Document numbers and images are not collected.", "Check official requirements for this trip"],
    mobile_access: ["Mobile data and contact access", "Maps, tickets, hotel communication and account recovery depend on working mobile access.", "Confirm roaming, eSIM or another data option"],
    cashless_access: ["Payment and backup method", "Only readiness is stored. Card, account and payment credentials are not collected.", "Confirm a working method and a backup"],
    lodging_eligibility: ["Hotel eligibility for foreign guests", item.status === "ready" ? "The selected stay has supporting eligibility evidence." : item.status === "blocked" ? "Current evidence says this stay is unsuitable for foreign guests." : "Current sources do not prove that the selected stay can accept foreign guests.", item.status === "action_required" ? "Choose a stay first" : "Confirm with the hotel or authorized platform"],
    china_account_continuity: ["Keep this trip available in China", item.status === "action_required" ? "This is a guest trip. Sign in to save it across devices and recover it during the trip." : "The trip is saved. Confirm that one sign-in method will remain usable in China.", item.status === "action_required" ? "Sign in and save" : "Confirm an in-China access method"],
    city_navigation: ["City routes and navigation", item.status === "ready" ? "Route, walking and transfer estimates were checked at the shown time." : "City movement still needs checking after places are confirmed. A planned route is not live arrival data.", "Confirm places and refresh routes"],
  }[item.itemId];
  return copy ? { ...item, title: copy[0], reason: copy[1], action: copy[2] } : item;
}

function readinessPrompt(item, locale = "zh-CN") {
  if (locale === "en") {
    const prompts = {
      trip_scope: "Help me complete the destination and exact dates that matter most for this trip: ",
      lodging_eligibility: "Prioritize stays that can accept foreign guests. Do not treat an option as bookable without eligibility evidence.",
      city_navigation: "After places are confirmed, check city routes, walking, transfers, entrances, exits and facilities that still need on-site confirmation.",
    };
    return prompts[item.itemId] ?? `Help me resolve “${item.title}” before departure. Explain the next step and a trustworthy source.`;
  }
  const prompts = {
    trip_scope: "请帮我补齐这趟旅行最需要的目的地和具体日期：",
    lodging_eligibility: "请优先比较并核验适合外宾入住的住宿；没有资格证据的候选不要当作可订酒店。",
    city_navigation: "请在地点确认后核验市内路线、步行、换乘、入口出口和需要现场确认的设施。",
  };
  return prompts[item.itemId] ?? `请帮我处理出发准备中的“${item.title}”：${item.action || "说明下一步和可信来源"}。`;
}

function ReadinessPanel({ readiness, onUpdate, onAction, onLogin, compact = false }) {
  const { locale, pick } = useUiLocale();
  if (!readiness) return null;
  const items = readiness.items.filter((item) => item.status !== "not_applicable").map((item) => localizedReadinessItem(item, locale));
  const visible = compact ? items.slice(0, 4) : items;
  const attention = items.filter((item) => item.status !== "ready").length;
  return <section className={`readiness-panel ${compact ? "compact" : ""}`} aria-labelledby="readiness-title">
    <header><div><span className="eyebrow">{pick("出发准备", "Before you go")}</span><h3 id="readiness-title">{attention ? (locale === "en" ? `${attention} items can affect this trip` : `${attention} 项会影响这趟旅行`) : pick("这趟旅行已经具备基本执行条件", "This trip has the basic conditions to proceed")}</h3><p>{pick("只显示与本次旅行有关的事项；不在这里收集证件号码、银行卡或账号凭据。", "Only trip-relevant items are shown. Document numbers, cards and account credentials are not collected here.")}</p></div><span className={`readiness-overall ${readiness.status}`}>{readiness.status === "ready" ? pick("已准备", "Ready") : readiness.status === "blocked" ? pick("存在阻断", "Blocked") : pick("继续完善", "Keep preparing")}</span></header>
    <div className="readiness-grid">{visible.map((item) => <article key={item.itemId} className={`readiness-item ${item.status}`}>
      <div className="readiness-item-title"><span>{item.status === "ready" ? <CheckCircle weight="fill" /> : <WarningCircle weight="fill" />}</span><div><strong>{item.title}</strong><small>{(locale === "en" ? READINESS_STATUS_LABELS_EN : READINESS_STATUS_LABELS)[item.status] ?? item.status}</small></div></div>
      <p>{item.reason}</p>
      <footer>
        {item.editable ? <div className="readiness-actions"><button type="button" className={item.status === "ready" ? "selected" : ""} onClick={() => onUpdate?.(item.itemId, "ready")}>{pick("我已准备", "I'm ready")}</button><button type="button" className={item.status === "action_required" ? "selected" : ""} onClick={() => onUpdate?.(item.itemId, "needs_help")}>{pick("需要帮助", "I need help")}</button></div> : item.itemId === "china_account_continuity" && item.status === "action_required" ? <button type="button" className="readiness-primary-action" onClick={onLogin}>{pick("登录保存旅行", "Sign in and save")}</button> : item.action ? <button type="button" className="readiness-primary-action" onClick={() => onAction?.(readinessPrompt(item, locale), item.title)}>{item.action}</button> : null}
        {item.guidanceUrl ? <a href={item.guidanceUrl} target="_blank" rel="noreferrer">{pick("查看官方核对入口", "Open official guidance")}<NavigationArrow /></a> : null}
      </footer>
    </article>)}</div>
    {compact && items.length > visible.length ? <small className="readiness-more">{locale === "en" ? `${items.length - visible.length} more items are available in trip details` : `另有 ${items.length - visible.length} 项可在行程详情继续核对`}</small> : null}
  </section>;
}

function ReadinessStrip({ readiness, onUpdate, onAction, onLogin }) {
  const { locale, pick } = useUiLocale();
  if (!readiness) return null;
  const items = readiness.items.filter((item) => item.status !== "not_applicable").map((item) => localizedReadinessItem(item, locale));
  const attention = items.filter((item) => item.status !== "ready");
  const statusLabel = attention.length
    ? (locale === "en" ? `${attention.length} items before departure` : `出发前还差 ${attention.length} 项`)
    : pick("出发准备已完成", "Ready for departure");
  return <details className={`readiness-strip ${attention.length ? "needs-attention" : "ready"}`}>
    <summary><span className="readiness-strip-icon">{attention.length ? <WarningCircle weight="fill" /> : <CheckCircle weight="fill" />}</span><span className="readiness-strip-copy"><small>{pick("出发准备", "Before you go")}</small><strong>{statusLabel}</strong></span><span className="readiness-strip-preview">{attention.slice(0, 2).map((item) => <em key={item.itemId}>{item.title}</em>)}</span><span className="readiness-strip-action">{pick("查看清单", "View checklist")}<CaretDown /></span></summary>
    <ReadinessPanel readiness={readiness} onUpdate={onUpdate} onAction={onAction} onLogin={onLogin} compact />
  </details>;
}

function FirstResultOverview({ trip, plan, proposal, nodes, onOpenComparison, onPreview, onAction }) {
  const { locale, pick } = useUiLocale();
  const [activeNodeId, setActiveNodeId] = useState(nodes[0]?.nodeId ?? null);
  useEffect(() => {
    if (!nodes.some((node) => node.nodeId === activeNodeId)) setActiveNodeId(nodes[0]?.nodeId ?? null);
  }, [nodes, activeNodeId]);
  const activeNode = nodes.find((node) => node.nodeId === activeNodeId) ?? nodes[0] ?? null;
  const transportTypes = new Set((proposal.byDomain?.transport ?? []).map((node) => node.operability?.transportType).filter(Boolean));
  const decisions = [
    (proposal.byDomain?.stay?.length ?? 0) ? { key: "stay", title: pick("先确定住宿锚点", "Choose the stay anchor first"), detail: locale === "en" ? `${proposal.byDomain.stay.length} stays differ in location or price and will change each day's route.` : `${proposal.byDomain.stay.length} 个有位置或价格差异的住宿候选，会改变每天路线。` } : null,
    (proposal.byDomain?.transport?.length ?? 0) ? { key: "transport", title: transportTypes.has("FLIGHT") && transportTypes.has("TRAIN") ? pick("飞机还是高铁", "Flight or high-speed rail") : pick("确定跨城到达方式", "Choose how to arrive"), detail: pick("到达时间与机场/车站会联动首日入住、晚餐和市内接驳。", "Arrival time and airport or station affect check-in, the first dinner and the city connection.") } : null,
    (proposal.byDomain?.food?.length ?? 0) || (proposal.byDomain?.play?.length ?? 0) ? { key: "local", title: pick("选择值得绕路的在地体验", "Choose what is worth the detour"), detail: pick("只保留地方特征、路线代价和执行方式能够说明的地点。", "Keep places whose local character, route cost and execution steps can be explained.") } : null,
  ].filter(Boolean).slice(0, 3);
  return <section className="first-result-overview" aria-labelledby="first-result-title">
    <header><div><h3 id="first-result-title">{pick("先确定住宿，再把到达、体验和餐饮连成路线", "Choose a stay, then connect arrival, experiences and food")}</h3><p>{trip?.destination ? (locale === "en" ? `Organized around ${trip.destination}` : `当前围绕 ${trip.destination} 组织`) : pick("目的地仍待补充", "Destination still needed")}{pick("；候选尚未写入行程，缺失的动态资料会继续明确显示。", ". Options are not in the trip yet, and missing live data remains visible.")}</p></div><button type="button" className="button primary" onClick={onOpenComparison}>{pick("比较候选", "Compare options")}</button></header>
    <div className="first-result-map"><TripDecisionMap nodes={nodes} activeNodeId={activeNode?.nodeId} onFocusNode={setActiveNodeId} mobility={plan?.mobility} tripId={trip?.tripId} staticMapAvailable={plan?.mapPreviewAvailable === true} label={pick("第一份旅行路线与候选地图", "First route and candidate map")} locale={locale} />{activeNode ? <MapFocusSummary node={activeNode} mobility={plan?.mobility} onPreview={() => onPreview(activeNode.nodeId)} /> : null}</div>
    <div className="first-result-reasons">{decisions.map((decision) => { const meta = domainMeta(decision.key === "local" ? "play" : decision.key); const Icon = meta.icon; return <article key={decision.key}><Icon weight="duotone" /><span><strong>{decision.title}</strong><small>{decision.detail}</small></span></article>; })}</div>
    {proposal.partial ? <div className="first-result-caveat"><WarningCircle weight="fill" /><span><strong>{pick("当前仍是部分结果", "This is still a partial result")}</strong><small>{locale === "en" ? "Some live sources are still missing. You can compare available evidence, but this is not yet a fully executable itinerary." : proposal.caveats?.[0] || "尚缺少一部分实时资料；可以先比较已有证据，但不能当作最终可执行日程。"}</small></span></div> : null}
  </section>;
}

function TodayPanel({ trip, plan, nodes, onShowItinerary, onPrefill }) {
  const { locale, pick } = useUiLocale();
  const today = plan?.today;
  const currentNode = nodes.find((node) => node.nodeId === today?.currentTask?.nodeId) ?? nodes[0] ?? null;
  const nextNode = nodes.find((node) => node.nodeId === today?.nextTask?.nodeId) ?? null;
  const recommended = today?.route?.alternatives?.find((alternative) => alternative.mode === today.route.recommendedMode) ?? null;
  if (!today || today.status === "planning") return <section className="today-pane empty"><span className="eyebrow">Today</span><MapTrifold weight="duotone" /><h2>{pick("确认地点后，这里会变成行中首页", "This becomes your on-trip home after places are confirmed")}</h2><p>{pick("现在还没有已确认的路线。先在行程中比较并确认吃、住、行、玩，地图才会显示真实地点和下一步。", "There is no confirmed route yet. Compare and confirm the connected trip first, then the map can show real places and the next step.")}</p><button type="button" className="button primary" onClick={onShowItinerary}>{pick("返回行程选择", "Back to trip choices")}</button></section>;
  return <section className="today-pane" aria-labelledby="today-title">
    <header><div><span className="eyebrow">Today · {pick("现在与下一步", "Now and next")}</span><h2 id="today-title">{currentNode?.title || pick("当前安排待确认", "Current plan needs confirmation")}</h2><p>{today.status === "needs_schedule" ? pick("地点已经确认，但还没有可靠的每天时间；先看路线，再补时间。", "Places are confirmed, but daily timing is not reliable yet. Check the route first, then add timing.") : scheduleLabel(currentNode)}</p></div><button type="button" className="quiet-button" onClick={onShowItinerary}><List />{pick("完整行程", "Full trip")}</button></header>
    <div className="today-map"><TripDecisionMap nodes={nodes} activeNodeId={currentNode?.nodeId} onFocusNode={() => {}} mobility={plan?.mobility} tripId={trip?.tripId} staticMapAvailable={plan?.mapPreviewAvailable === true} label={pick("今日地点和路线地图", "Today's places and routes map")} locale={locale} /></div>
    <article className="today-current-card">{currentNode?.media?.[0] ? <img src={currentNode.media[0].url} alt={currentNode.media[0].title || `${currentNode.title} ${pick("实景图", "photo")}`} /> : null}<div><small>{pick("现在", "Now")}</small><strong>{currentNode?.title}</strong><p>{currentNode?.location?.address || currentNode?.location?.label || pick("位置资料待核验", "Location still needs checking")}</p>{recommended ? <span>{MOBILITY_MODE_LABELS[today.route.recommendedMode] || today.route.recommendedMode}，{locale === "en" ? `about ${recommended.totalMinutes} min` : `约 ${recommended.totalMinutes} 分钟`}{recommended.walkingMeters != null ? (locale === "en" ? `, ${Math.round(recommended.walkingMeters)} m walking` : `，步行 ${Math.round(recommended.walkingMeters)} 米`) : ""}</span> : <span>{pick("城市路线仍待核验", "City route still needs checking")}</span>}</div></article>
    {nextNode ? <div className="today-next-card"><span><Clock /></span><div><small>{pick("下一步", "Next")}</small><strong>{nextNode.title}</strong><p>{scheduleLabel(nextNode)}</p></div><NavigationArrow /></div> : null}
    {today.attentionItems?.length ? <section className="today-attention"><strong>{pick("出发前再看一眼", "Check before leaving")}</strong>{today.attentionItems.map((rawItem) => { const item = localizedReadinessItem(rawItem, locale); return <span key={item.itemId}><WarningCircle weight="fill" />{item.title}: {(locale === "en" ? READINESS_STATUS_LABELS_EN : READINESS_STATUS_LABELS)[item.status]}</span>; })}</section> : null}
    <section className="today-change"><div><strong>{pick("事情有变化？", "Something changed?")}</strong><small>{pick("只调整受影响部分，不重做整趟旅行。", "Only update the affected part, not the whole trip.")}</small></div><div>{(locale === "en" ? [["Flight or train delayed", "Transport delay"], ["It started raining", "Rain"], ["A traveler's energy changed", "Energy change"], ["A place closed unexpectedly", "Place closed"]] : [["航班或火车延误", "航班或火车延误"], ["开始下雨", "开始下雨"], ["同行人体力变化", "同行人体力变化"], ["地点临时关闭", "地点临时关闭"]]).map(([label, context]) => <button key={label} type="button" onClick={() => onPrefill(locale === "en" ? `Something changed: ${label}. Keep confirmed plans that are not affected, give me one reliable alternative, and explain the impact.` : `事情有变化：${label}。请保留不受影响的已确认安排，只给我一个可靠替代并说明影响。`, context)}>{label}</button>)}</div></section>
    <p className="today-freshness">{pick("路线为查询时估算，不是实时到站或即时车费；电梯、卫生间等设施资料需现场确认。", "Routes are query-time estimates, not live arrivals or final fares. Elevators, toilets and other facilities must be confirmed on site.")}</p>
  </section>;
}

function PlanningWorkspaceSkeleton() {
  const { pick } = useUiLocale();
  return <section className="workspace-planning-state" role="status" aria-live="polite">
    <header><span><MapTrifold weight="duotone" /></span><div><h2>{pick("正在把需求整理成一趟旅行", "Turning your request into a trip")}</h2><p>{pick("先理解同行人和预算，再核验地点、路线与可执行信息。", "Understanding travelers and budget, then checking places, routes and execution details.")}</p></div></header>
    <div className="planning-skeleton-layout" aria-hidden="true"><div className="planning-skeleton-map"><i /><i /><i /><i className="route" /></div><div className="planning-skeleton-list">{[0, 1, 2].map((item) => <span key={item}><b /><em><i /><i /></em></span>)}</div></div>
    <footer>{pick("真实资料返回后，地图和可比较候选会直接出现在这里。", "The map and comparable options will appear here when verified sources return.")}</footer>
  </section>;
}

function TripWorkspaceEmpty({ hasMessages = false }) {
  const { pick } = useUiLocale();
  return <section className="workspace-zero-state">
    <figure><img src="/assets/login-travelers-waterfront.png" alt={pick("旅行者在水岸边查看行程", "Travelers reviewing a trip by the waterfront")} /></figure>
    <div className="workspace-zero-copy"><h2>{hasMessages ? pick("需求已经保留，可以继续补充", "Your request is saved. Continue when ready.") : pick("地图和行程会在这里出现", "Your map and trip will appear here")}</h2><p>{hasMessages ? pick("资料恢复或信息补齐后，旅行助手会从当前对话继续，不用重新填写。", "When sources recover or details are complete, the Agent continues from this conversation.") : pick("旅行助手理解需求后，会把地点、路线、准备事项和待确认选择放在同一个工作区。", "Once the Agent understands your request, places, routes, preparation and choices stay in one workspace.")}</p><ul><li><MapTrifold weight="duotone" /><span><strong>{pick("先看空间关系", "See the spatial picture")}</strong><small>{pick("住宿锚点、到达方式和地点分布", "Stay anchor, arrival and place distribution")}</small></span></li><li><Compass weight="duotone" /><span><strong>{pick("只比较关键取舍", "Compare meaningful tradeoffs")}</strong><small>{pick("时间、预算、步行和同行人适配", "Time, budget, walking and traveler fit")}</small></span></li><li><CheckCircle weight="duotone" /><span><strong>{pick("确认后才加入旅行", "Confirm before anything changes")}</strong><small>{pick("缺失资料和风险始终明确显示", "Missing evidence and risks stay visible")}</small></span></li></ul></div>
  </section>;
}

function PlanCanvas({ conversation, trip, plan, tripRecovery, dataUnavailable, onRefresh, onRetryResearch, onRecoverTrip, onAcceptProposal, onRejectProposal, onSubmitFeedback, onUpdateReadiness, onRequestLogin, onPrefill, onFocusMap, activeMobileView, onMobileViewChange, loading }) {
  const { locale, pick } = useUiLocale();
  const items = useMemo(() => Object.entries(plan?.byDomain ?? {}).flatMap(([domain, nodes]) => nodes.filter((node) => node.selected).map((node) => ({ ...node, domain }))), [plan]);
  const proposal = plan?.pendingProposals?.[0] ?? null;
  const proposalCandidates = useMemo(() => proposal ? DOMAIN_ITEMS.flatMap(({ key }) => (proposal.byDomain?.[key] ?? []).map((node) => ({ ...node, domain: key }))) : [], [proposal]);
  const proposalDomainSummary = proposal ? DOMAIN_ITEMS.filter(({ key }) => (proposal.byDomain?.[key]?.length ?? 0) > 0).map(({ key }) => domainLabel(key, locale)).join(locale === "en" ? ", " : "、") : "";
  const workspaceNodes = items.length ? items : proposalCandidates;
  const [selections, setSelections] = useState({});
  const [detailNodeId, setDetailNodeId] = useState(null);
  const [activeLegId, setActiveLegId] = useState(null);
  const [acceptedFocusNodeId, setAcceptedFocusNodeId] = useState(null);
  const [comparisonOpen, setComparisonOpen] = useState(false);
  useEffect(() => {
    if (!proposal) return setSelections({});
    setComparisonOpen(false);
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
  useEffect(() => {
    if (!items.some((node) => node.nodeId === acceptedFocusNodeId)) setAcceptedFocusNodeId(items[0]?.nodeId ?? null);
  }, [items, acceptedFocusNodeId]);
  const detailNode = workspaceNodes.find((node) => node.nodeId === detailNodeId) ?? null;
  const acceptedFocusNode = items.find((node) => node.nodeId === acceptedFocusNodeId) ?? items[0] ?? null;
  return <section className={`trip-workspace mobile-mode-${activeMobileView}`} id="trip-plan-canvas">
    {trip && activeMobileView === "map" ? <TodayPanel trip={trip} plan={plan} nodes={items} onShowItinerary={() => onMobileViewChange("itinerary")} onPrefill={onPrefill} /> : !trip ? tripRecovery ? <div className="workspace-empty recovery-launchpad">
      <div className="recovery-card"><span className="recovery-icon"><ArrowsClockwise weight="bold" /></span><h2>{pick("旅行要求还在，草案需要重新建立", "Your requirements are safe; the trip draft needs rebuilding")}</h2><p>{pick("这段历史对话保存完整，但原来的旅行草案已经丢失。重新建立后，助手会沿用你说过的目的地、同行人和偏好，不需要从头填写。", "The conversation is intact, but its trip draft is missing. Rebuilding will reuse the destination, travelers and preferences you already shared.")}</p><button className="button primary" type="button" onClick={onRecoverTrip} disabled={loading}>{loading ? <CircleNotch className="spin" /> : <ArrowsClockwise />}{pick("恢复并继续规划", "Restore and continue")}</button><small>{pick("不会自动确认、购买或覆盖其他旅行。", "This will not confirm, purchase or overwrite another trip.")}</small></div>
      <div className="launchpad-preview"><div className="launch-domain-grid">{DOMAIN_ITEMS.map(({ key, icon: Icon }) => <div key={key}><Icon weight="duotone" /><strong>{domainLabel(key, locale)}</strong><span>{key === "transport" ? pick("路线与换乘", "Routes and transfers") : key === "stay" ? pick("位置与住宿", "Location and stays") : key === "food" ? pick("本地餐饮", "Local food") : pick("体验与节奏", "Experiences and pace")}</span></div>)}</div><p><MapTrifold />{pick("地图、地点图片、路线和设施会与候选一起出现。", "Maps, place photos, routes and facilities appear with the options.")}</p></div>
    </div> : loading ? <PlanningWorkspaceSkeleton /> : <TripWorkspaceEmpty hasMessages={Boolean(conversation?.messages?.length)} /> : <>
      <section className="itinerary-pane" aria-label={pick("旅行安排", "Trip plan")}>
        <div className="canvas-topline"><div><h2>{trip.destination || pick("目的地待补充", "Destination needed")}</h2></div><button className="quiet-button" onClick={onRefresh} disabled={loading}><ArrowsClockwise />{pick("刷新", "Refresh")}</button></div>
        <div className="trip-brief-bar">{tripBriefChips(trip, locale).map((chip) => <button key={chip.key} type="button" className={chip.missing ? "missing" : ""} onClick={() => { onPrefill(chip.prompt); onMobileViewChange("conversation"); }}>{chip.key === "dates" ? <CalendarBlank /> : chip.key === "pace" ? <PersonSimpleWalk /> : <MapPin />}<span>{chip.label}</span>{chip.missing && <small>{pick("补充", "Add")}</small>}</button>)}</div>
        <ReadinessStrip readiness={plan?.readiness} onUpdate={onUpdateReadiness} onAction={onPrefill} onLogin={onRequestLogin} />
        {items.length ? <button type="button" className="today-mobile-entry" onClick={() => onMobileViewChange("map")}><MapTrifold weight="duotone" /><span><strong>{pick("打开 Today 地图", "Open the Today map")}</strong><small>{pick("查看现在、下一步与变化恢复", "See now, next and recovery")}</small></span><NavigationArrow /></button> : null}
        <div className="domain-coverage compact">{DOMAIN_ITEMS.map(({ key, icon: Icon }) => { const acceptedCount = plan?.byDomain?.[key]?.filter((node) => node.selected).length ?? 0; const pendingCount = proposal?.byDomain?.[key]?.length ?? 0; return <div key={key} className={acceptedCount || pendingCount ? "covered" : ""}><Icon weight="duotone" /><span>{domainLabel(key, locale)}</span><small>{acceptedCount ? pick("已选", "Selected") : pendingCount ? (locale === "en" ? `${pendingCount} options` : `${pendingCount} 个候选`) : pick("待研究", "Research needed")}</small></div>; })}</div>
        {proposal && !items.length ? <FirstResultOverview trip={trip} plan={plan} proposal={proposal} nodes={proposalCandidates} onOpenComparison={() => setComparisonOpen(true)} onPreview={setDetailNodeId} onAction={onPrefill} /> : items.length ? <>
          {proposal ? <button type="button" className="candidate-update-banner" onClick={() => setComparisonOpen(true)}><span><Sparkle weight="fill" /></span><span><strong>{locale === "en" ? `New ${proposalDomainSummary || "trip"} options are ready to compare` : `新的${proposalDomainSummary || "旅行"}候选等待比较`}</strong><small>{pick("已确认地点保持不变；打开候选池后再决定是否替换。", "Confirmed places stay unchanged until you choose a replacement.")}</small></span><NavigationArrow /></button> : null}
          <div className="accepted-heading"><div><span className="workspace-state-label">{plan?.today?.status === "ready" ? pick("按天行程", "Day timeline") : pick("路线骨架", "Route skeleton")}</span><h3>{plan?.today?.status === "ready" ? pick("按每天时间查看这趟旅行", "View this trip by day and time") : pick("先看地点和空间关系，再补每天时间", "Start with places and movement, then add daily timing")}</h3><p>{plan?.today?.status === "ready" ? pick("时间、顺序和移动信息已经可以共同查看。", "Timing, order and movement can now be reviewed together.") : pick("当前地点已经确认，但时间或城市路线仍不完整，因此不会显示伪精确日程。", "Places are confirmed, but timing or city routes are incomplete, so no false-precision itinerary is shown.")}</p></div><span>{pick("仍可通过对话调整", "Adjust anytime by chat")}</span></div>
          <div className="accepted-explorer-layout"><div className="journey-card-grid">{items.map((item, index) => { const meta = domainMeta(item.domain); const Icon = meta.icon; const focused = item.nodeId === acceptedFocusNode?.nodeId; return <article key={item.nodeId} className={`journey-card ${focused ? "map-focused" : ""}`}>{item.media?.[0] ? <img src={item.media[0].url} alt={item.media[0].title || `${item.title} ${pick("实景图", "photo")}`} loading="lazy" referrerPolicy="no-referrer" /> : <div className="journey-card-no-media"><Icon weight="duotone" /></div>}<div className="journey-card-copy"><span><Icon weight="duotone" />{domainLabel(item.domain, locale)} · {locale === "en" ? `item ${index + 1}` : `第 ${index + 1} 项`}</span><h4>{item.title}</h4><p>{item.summary || pick("待补充说明", "Details still needed")}</p><small><Clock />{scheduleLabel(item)}</small><em>{acceptedSourceLabel(item)}</em></div><footer><button className="journey-map-button" type="button" aria-pressed={focused} onClick={() => setAcceptedFocusNodeId(item.nodeId)}><MapPin weight="fill" />{pick("地图定位", "Locate")}</button><button className="journey-detail-button" type="button" aria-label={locale === "en" ? `Open photos, map and facilities for ${item.title}` : `打开${item.title}的照片、地图与设施详情`} onClick={() => setDetailNodeId(item.nodeId)}><span><strong>{pick("地点详情", "Place details")}</strong><small>{pick("照片 · 设施", "Photos · facilities")}</small></span><CaretDown /></button></footer></article>; })}</div><aside className="accepted-map-panel"><header><strong>{pick("地点、路线和设施在一张图里", "Places, routes and facilities on one map")}</strong><button type="button" onClick={onFocusMap}><MapTrifold />{pick("专注地图", "Focus map")}</button></header><TripDecisionMap nodes={items} activeNodeId={acceptedFocusNode?.nodeId} onFocusNode={setAcceptedFocusNodeId} mobility={plan?.mobility} tripId={trip?.tripId} staticMapAvailable={plan?.mapPreviewAvailable === true} label={pick("已选旅行地点与路线地图", "Selected places and route map")} locale={locale} /><MapFocusSummary node={acceptedFocusNode} mobility={plan?.mobility} onPreview={() => acceptedFocusNode && setDetailNodeId(acceptedFocusNode.nodeId)} /></aside></div>
          <PlanQualityNotice qa={plan?.qa} />
          <MobilityPlanningCard mobility={plan?.mobility} activeLegId={activeLegId} onSelectLeg={setActiveLegId} />
        </> : dataUnavailable ? <div className="canvas-empty blocked-research"><WarningCircle weight="duotone" /><h3>{pick("暂时找不到实时地点资料", "Live place data is temporarily unavailable")}</h3><p>{pick("你的旅行要求已经记住了。等资料恢复后再继续查找，之前说过的内容不用重来。", "Your requirements are saved. Continue when the source recovers; you will not need to repeat what you shared.")}</p><button className="button retry" onClick={onRetryResearch} disabled={loading}><ArrowsClockwise />{pick("重新查找旅行方案", "Try research again")}</button></div> : <div className="canvas-empty"><Sparkle weight="duotone" /><h3>{pick("还差一点旅行信息", "A little more trip context is needed")}</h3><p>{pick("继续在对话中补充。助手只会追问真正影响方案的问题。", "Continue in chat. The Agent only asks questions that can change the plan.")}</p></div>}
        <div className="trip-supporting-tools">
          {!proposal ? <PlanNextStep trip={trip} plan={plan} onPrefill={onPrefill} onMobileViewChange={onMobileViewChange} /> : null}
          <details className="planning-context"><summary><span><strong>{pick("预算、同行人和天气", "Budget, travelers and weather")}</strong><small>{trip.totalBudget != null ? `${pick("预算", "Budget")} ¥${new Intl.NumberFormat(locale === "en" ? "en-US" : "zh-CN").format(trip.totalBudget)}` : pick("预算待补", "Budget needed")}，{locale === "en" ? `${trip.travelerCount || 1} travelers` : `${trip.travelerCount || 1} 人`}，{hasSpecificTravelDates(trip.dates) ? pick("日期已明确", "dates confirmed") : pick("日期待补", "dates needed")}</small></span><span>{pick("查看与编辑", "View and edit")}</span></summary><TravelerCareSummary trip={trip} onEdit={onPrefill} /><WeatherPlanningCard weather={plan?.weather} onEdit={onPrefill} /></details>
        </div>
      </section>
    </>}
    {proposal && comparisonOpen ? <div className="proposal-drawer-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setComparisonOpen(false); }}><ProposalPanel proposal={proposal} trip={trip} plan={plan} selections={selections} onSelect={(domain, nodeId) => setSelections((current) => ({ ...current, [domain]: nodeId }))} onPreviewCandidate={setDetailNodeId} onAskAgent={onPrefill} onFocusMap={onFocusMap} onAccept={onAcceptProposal} onReject={onRejectProposal} onClose={() => setComparisonOpen(false)} loading={loading} /></div> : null}
    <PlaceDetailSheet node={detailNode} plan={plan} tripId={trip?.tripId} onClose={() => setDetailNodeId(null)} onSubmitFeedback={(input) => onSubmitFeedback(detailNode, input)} />
    {conversation?.messages?.some((message) => message.role === "status" && message.kind?.includes("model")) && <div className="canvas-warning workspace-warning"><WarningCircle weight="fill" /><div><strong>旅行助手暂时无法回应</strong><p>你的需求会保留，服务恢复后可以从这里继续。</p></div></div>}
  </section>;
}

function ConversationPicker({ conversations, activeId, unavailableTripIds, onPick, onNew }) {
  const { locale, pick } = useUiLocale();
  return <aside className="conversation-picker"><div><h2>{pick("你的旅行对话", "Your trip conversations")}</h2></div><button className="new-chat" onClick={onNew}><Plus />{pick("新对话", "New conversation")}</button><div className="conversation-list">{conversations.length ? conversations.map((conversation) => {
    const needsRecovery = conversation.tripId && unavailableTripIds?.has(conversation.tripId);
    return <button key={conversation.conversationId} onClick={() => onPick(conversation.conversationId)} className={conversation.conversationId === activeId ? "active" : ""}><strong>{conversation.messages.find((message) => message.role === "user")?.text || pick("新的旅行想法", "New trip idea")}</strong><span className="conversation-meta"><small className={needsRecovery ? "needs-recovery" : ""}>{needsRecovery ? pick("草案需恢复", "Draft needs recovery") : conversation.tripId ? pick("已建立旅行草案", "Trip draft created") : pick("等待旅行需求", "Waiting for a request")}</small><time>{formatConversationRecency(conversation.updatedAt, locale)}</time></span></button>;
  }) : <p>{pick("还没有对话。", "No conversations yet.")}</p>}</div></aside>;
}

function TravelEditor({ session, onLogout, onRequestLogin }) {
  const { locale, setLocale, pick } = useUiLocale();
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
  const [conversationCollapsed, setConversationCollapsed] = useState(false);
  const [draftContext, setDraftContext] = useState("");
  const [status, setStatus] = useState({ loading: true });
  const [mediaStatus, setMediaStatus] = useState({});
  const [imageAttachment, setImageAttachment] = useState(null);
  const [paneLayout, setPaneLayout] = useState(storedPaneLayout);
  const scrollerRef = useRef(null);
  const composerRef = useRef(null);
  useEffect(() => {
    try {
      window.localStorage.setItem("travel-agent-pane-layout-v1", JSON.stringify(paneLayout));
    } catch {
      // Embedded clients may disable persistent storage; resizing still works for the current session.
    }
  }, [paneLayout]);
  useEffect(() => {
    const keepResultReadable = () => setPaneLayout((current) => {
      const conversation = clamp(current.conversation, 340, maxConversationPaneWidth());
      return conversation === current.conversation ? current : { ...current, conversation };
    });
    keepResultReadable();
    window.addEventListener("resize", keepResultReadable);
    return () => window.removeEventListener("resize", keepResultReadable);
  }, []);
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
    if (!conversation?.messages?.length && !pendingText) {
      scrollerRef.current.scrollTo({ top: 0 });
      return;
    }
    scrollerRef.current.scrollTo({ top: scrollerRef.current.scrollHeight, behavior: "smooth" });
  }, [conversation?.messages?.length, pendingText, status.loading, status.activities]);
  const selectConversation = useCallback(async (conversationId) => {
    setStatus({ loading: true });
    try {
      const selected = await api.conversation(conversationId);
      setConversation(selected);
      setImageAttachment(null);
      setMediaStatus({});
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
      setConversation(created); setTrip(null); setPlan(null); setTripRecovery(null); setDraft(""); setDraftContext(""); setImageAttachment(null); setMediaStatus({}); setConversationCollapsed(false); setMobileView("conversation"); setHistoryOpen(false);
      setSelectedModelId(created.modelId);
      await refreshConversations(); setStatus({});
    } catch (error) { setStatus({ error: messageError(error) }); }
  };
  const submitMessage = async (text) => {
    const attachment = imageAttachment;
    const clean = text.trim() || (attachment ? pick("请结合这张旅行图片理解我的需求，并直接继续核验和规划。", "Use this travel image to understand my request, then continue checking sources and planning.") : "");
    if (!clean || status.loading) return;
    setStatus({ loading: true }); setPendingText(clean); setDraft(""); setDraftContext(""); setImageAttachment(null); setMediaStatus({});
    try {
      let current = conversation;
      const modelId = selectedModelId || providerStatus?.modelSelection?.defaultModelId || "deepseek-v4-flash";
      if (!current) current = await api.createConversation({ modelId });
      const result = await api.sendConversationMessage(current.conversationId, clean, modelId, attachment ? [{ mimeType: attachment.mimeType, data: attachment.data }] : undefined);
      setConversation(result.conversation);
      setSelectedModelId(result.conversation.modelId);
      await refreshConversations();
      const resultTripId = result.tripId ?? result.conversation.tripId;
      await loadTrip(resultTripId);
      if (resultTripId) setMobileView("itinerary");
      setPendingText("");
      setStatus({ activities: result.activities ?? [], turnStatus: result.status });
      if (result.multimodal?.status === "completed") setMediaStatus({ notice: pick("图片已在本轮参与理解、核验和规划；原图未保存。", "The image was used for this planning turn and was not saved.") });
    } catch (error) { setPendingText(""); setDraft(clean); setImageAttachment(attachment); setStatus({ error: messageError(error) }); }
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
  const submitFeedback = async (node, input) => {
    if (!trip?.tripId || !node?.nodeId || !plan) throw Object.assign(new Error("feedback_context_unavailable"), { code: "feedback_context_unavailable" });
    const result = await api.submitFeedback(trip.tripId, { ...input, nodeId: node.nodeId, baseRevision: plan.revision });
    if (result.status !== "committed") throw Object.assign(new Error(result.status), { code: result.validation?.reason ?? result.status });
    await loadTrip(trip.tripId);
    return result;
  };
  const prepareDraft = useCallback((text, contextLabel = "") => {
    setDraft(text);
    setDraftContext(contextLabel);
    setConversationCollapsed(false);
    setMobileView("conversation");
    window.requestAnimationFrame(() => {
      composerRef.current?.focus();
      composerRef.current?.setSelectionRange(text.length, text.length);
      composerRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    });
  }, []);
  const updateDraft = useCallback((value) => {
    setDraft(value);
    if (!value.trim()) setDraftContext("");
  }, []);
  const inspectImage = useCallback(async (file) => {
    if (!file || !["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 3_000_000) {
      setMediaStatus({ error: pick("请选择不超过 3MB 的 JPG、PNG 或 WebP 图片。", "Choose a JPG, PNG or WebP image no larger than 3 MB.") });
      return;
    }
    setMediaStatus({ loading: true });
    try {
      const data = await imagePayload(file);
      setImageAttachment({ name: file.name.slice(0, 120), mimeType: file.type, data, previewUrl: `data:${file.type};base64,${data}` });
      setMediaStatus({ notice: pick("图片已就绪。补充一句你想让旅行助手做什么，然后一起发送。", "Image ready. Add what you want the Travel Agent to do, then send both together.") });
      setConversationCollapsed(false);
      setMobileView("conversation");
      window.requestAnimationFrame(() => composerRef.current?.focus());
    } catch (error) {
      setMediaStatus({ error: pick("这张图片暂时无法读取，请换一张或直接描述。", "This image could not be read. Try another one or describe it directly.") });
    }
  }, [pick]);
  const updateReadiness = useCallback(async (signalId, nextStatus) => {
    if (!trip?.tripId) return;
    try {
      await api.updateReadiness(trip.tripId, signalId, nextStatus);
      await loadTrip(trip.tripId);
      setStatus({ activities: [{ toolName: "trip_readiness", status: "updated" }] });
    } catch (error) {
      setStatus({ error: messageError(error) });
    }
  }, [trip?.tripId, loadTrip]);
  const quickReplies = quickRepliesForTrip(trip, locale);
  return <main className="editor-shell">
    <header className="editor-topbar"><button className="history-button" type="button" onClick={() => setHistoryOpen(true)} aria-label={pick("打开旅行对话记录", "Open trip conversations")}><ChatsCircle weight="duotone" /><span>{pick("我的行程", "Trips")}</span></button><div className="brand"><MapPin weight="fill" /> Travel Agent</div><div className="topbar-copy"><span>{trip?.destination || pick("旅行助手", "Trip assistant")}</span><small>{trip ? `${trip.dates || (trip.durationDays ? `${trip.durationDays} ${locale === "en" ? "days" : "天"}` : pick("时间待补", "Dates needed"))} · ${locale === "en" ? `${trip.travelerCount} travelers` : `${trip.travelerCount} 人`}` : pick("无需登录，从一句话开始", "Start with one sentence, no sign-in")}</small></div><nav className="mobile-workspace-tabs" aria-label={pick("旅行工作区", "Trip workspace")}><button type="button" className={mobileView === "conversation" ? "active" : ""} onClick={() => setMobileView("conversation")}><ChatsCircle />{pick("对话", "Chat")}</button><button type="button" className={mobileView === "itinerary" ? "active" : ""} disabled={!trip} onClick={() => setMobileView("itinerary")}><List />{pick("行程", "Trip")}</button><button type="button" className={mobileView === "map" ? "active" : ""} disabled={!trip} onClick={() => setMobileView("map")}><MapTrifold />{pick("地图", "Map")}</button></nav><button className="locale-switch" type="button" onClick={() => setLocale(locale === "en" ? "zh-CN" : "en")} aria-label={locale === "en" ? "切换为中文" : "Switch interface to English"}>{locale === "en" ? "中文" : "EN"}</button><div className="account-actions">{session.guest ? <button className="guest-save-button" type="button" onClick={onRequestLogin}><span><strong>{pick("临时旅行", "Guest trip")}</strong><small>{pick("登录保存与跨端继续", "Sign in to save and continue")}</small></span></button> : <><span>{session.displayName || SESSION_PROVIDER_LABELS[session.provider] || pick("旅行者", "Traveler")}</span><button className="icon-button" onClick={onLogout} aria-label={pick("退出登录", "Sign out")}><SignOut /></button></>}</div></header>
    {historyOpen ? <div className="history-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setHistoryOpen(false); }}><div className="history-drawer" role="dialog" aria-modal="true" aria-label={pick("旅行对话记录", "Trip conversations")}><button className="history-close icon-button" type="button" onClick={() => setHistoryOpen(false)} aria-label={pick("关闭旅行对话记录", "Close trip conversations")}><X /></button><ConversationPicker conversations={conversations} activeId={conversation?.conversationId} unavailableTripIds={unavailableTripIds} onPick={selectConversation} onNew={createConversation} /></div></div> : null}
    <div className={`editor-layout ${conversationCollapsed ? "conversation-collapsed" : ""}`} style={{ "--conversation-width": `${paneLayout.conversation}px` }}>
      <button className="conversation-reopen" type="button" onClick={() => setConversationCollapsed(false)} aria-label={pick("展开旅行对话", "Expand trip conversation")}><ChatsCircle weight="duotone" /><span>{pick("展开对话", "Expand chat")}</span><CaretDown /></button>
      <section className={`conversation-panel ${mobileView !== "conversation" ? "mobile-hidden" : ""}`}>
        <header className="conversation-header"><div><h2>{trip ? pick("继续完善这趟旅行", "Continue shaping this trip") : tripRecovery ? pick("恢复这趟旅行", "Recover this trip") : pick("和旅行助手对话", "Talk with the Travel Agent")}</h2></div><div className="conversation-header-actions">{trip ? <span className="draft-state"><CheckCircle weight="fill" />{pick("已记住旅行要求", "Requirements saved")}</span> : tripRecovery ? <span className="draft-state recovery"><ArrowsClockwise />{pick("草案需恢复", "Draft needs recovery")}</span> : <span className="draft-state muted">{pick("从一句话开始", "Start with one sentence")}</span>}<button className="conversation-collapse-button" type="button" onClick={() => setConversationCollapsed(true)} aria-label={pick("收起旅行对话", "Collapse trip conversation")}><CaretDown /><span>{pick("收起", "Collapse")}</span></button></div></header>
        {status.error && <div className="chat-error" role="alert"><WarningCircle />{status.error}<button onClick={() => setStatus({})}>{pick("关闭提示", "Dismiss")}</button></div>}
        <div className="message-scroller" ref={scrollerRef}>{!conversation?.messages?.length ? pendingText && status.loading ? <><article className="chat-message user pending"><div className="message-avatar">你</div><div className="message-copy"><MessageBody text={pendingText} /><time>正在发送</time></div></article><ThinkingMessage /></> : <ConversationIntro onPrompt={(prompt) => submitMessage(prompt)} /> : <>{conversation.messages.map((message) => <MessageBubble key={message.messageId} message={message} />)}{status.loading && <ThinkingMessage />}<ActivityStrip activities={status.activities} /></>}</div>
        {trip && quickReplies.length ? <div className="quick-replies" aria-label="快捷调整旅行要求">{quickReplies.map((reply) => <button key={reply.label} type="button" disabled={status.loading} onClick={() => reply.prefill ? prepareDraft(reply.prefill, reply.label) : submitMessage(reply.text)}>{reply.label}</button>)}</div> : null}
        {mediaStatus.error || mediaStatus.notice ? <div className={`media-notice ${mediaStatus.error ? "error" : ""}`} role={mediaStatus.error ? "alert" : "status"}>{mediaStatus.error || mediaStatus.notice}<button type="button" onClick={() => setMediaStatus({})}>{pick("关闭", "Dismiss")}</button></div> : null}
        <Composer value={draft} onChange={updateDraft} onSubmit={submitMessage} loading={status.loading} inputRef={composerRef} contextLabel={draftContext} onClearContext={() => { setDraft(""); setDraftContext(""); composerRef.current?.focus(); }} onInspectImage={inspectImage} imageAttachment={imageAttachment} onRemoveImage={() => { setImageAttachment(null); setMediaStatus({}); composerRef.current?.focus(); }} imageLoading={mediaStatus.loading} onLinkPrompt={() => prepareDraft(locale === "en" ? "I want to import a travel share link:\n\nIf this link cannot be read safely, do not guess its content. Tell me the next verifiable step." : "我想导入一个旅行分享链接：\n\n如果当前无法安全读取这个链接，请不要猜测内容；告诉我可以核验的下一步。", pick("旅行分享链接", "Travel share link"))} />
      </section>
      <ResizeHandle className="workspace-resizer" label={pick("调整对话与方案宽度", "Resize chat and trip result")} onPointerDown={(event) => resizePane("conversation", event, 340, maxConversationPaneWidth())} onNudge={(delta) => nudgePane("conversation", delta, 340, maxConversationPaneWidth())} />
      <PlanCanvas conversation={conversation} trip={trip} plan={plan} tripRecovery={tripRecovery} dataUnavailable={providerStatus?.data?.amapOfficialMcp === "blocked" && !["available_read_only", "trial_read_only"].includes(providerStatus?.data?.fliggyFlyAi) && providerStatus?.data?.tuniuOfficialMcp !== "available_read_only"} onRefresh={() => loadTrip(conversation?.tripId).catch((error) => setStatus({ error: messageError(error) }))} onRetryResearch={() => submitMessage(locale === "en" ? "Continue planning and research the connected trip again." : "继续规划，请重新查找吃、住、行、玩方案。") } onRecoverTrip={() => submitMessage(locale === "en" ? "Rebuild the trip draft from the requirements already stated in this conversation and continue planning the connected trip." : "请根据这段对话中已经说明的旅行要求，重新建立旅行草案并继续规划吃、住、行、玩。") } onAcceptProposal={acceptProposal} onRejectProposal={rejectProposal} onSubmitFeedback={submitFeedback} onUpdateReadiness={updateReadiness} onRequestLogin={onRequestLogin} onPrefill={prepareDraft} onFocusMap={() => setConversationCollapsed(true)} activeMobileView={mobileView} onMobileViewChange={setMobileView} loading={status.loading} />
    </div>
  </main>;
}

export function TravelApp() {
  const [locale, setLocale] = useState(initialUiLocale);
  const [session, setSession] = useState(undefined);
  const [health, setHealth] = useState(null);
  const [authProviders, setAuthProviders] = useState(null);
  const [authError, setAuthError] = useState(null);
  const [loginOpen, setLoginOpen] = useState(false);
  useEffect(() => {
    document.documentElement.lang = locale === "en" ? "en" : "zh-CN";
    window.localStorage.setItem("travel-agent-ui-locale", locale);
  }, [locale]);
  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    const nextAuthError = query.get("auth_error");
    setAuthError(nextAuthError);
    Promise.all([api.session().catch(() => null), api.health().catch(() => null), api.authProviders().catch(() => null)]).then(async ([restoredSession, nextHealth, nextProviders]) => {
      const nextSession = restoredSession ?? await api.createGuestSession().catch(() => null);
      setSession(nextSession);
      setHealth(nextHealth);
      setAuthProviders(nextProviders);
      setLoginOpen(Boolean(nextAuthError));
      if (query.has("auth") || query.has("auth_error")) {
        query.delete("auth");
        query.delete("auth_error");
        const nextQuery = query.toString();
        window.history.replaceState({}, "", `${window.location.pathname}${nextQuery ? `?${nextQuery}` : ""}${window.location.hash}`);
      }
    });
  }, []);
  const acceptSession = (nextSession) => { setSession(nextSession); setLoginOpen(false); setAuthError(null); };
  const logout = async () => {
    await api.logout().catch(() => null);
    setSession(await api.createGuestSession().catch(() => null));
  };
  const localeContext = useMemo(() => ({ locale, setLocale, pick: (zh, en) => locale === "en" ? en : zh }), [locale]);
  if (session === undefined) return <UiLocaleContext.Provider value={localeContext}><main className="app-loading"><CircleNotch className="spin" />{locale === "en" ? "Restoring session" : "正在恢复会话"}</main></UiLocaleContext.Provider>;
  if (!session) return <UiLocaleContext.Provider value={localeContext}><LoginScreen onSession={acceptSession} developmentAuthEnabled={health?.developmentAuthEnabled === true} providerStatus={authProviders} initialError={authError} /></UiLocaleContext.Provider>;
  return <UiLocaleContext.Provider value={localeContext}><TravelEditor key={session.userId} session={session} onLogout={logout} onRequestLogin={() => setLoginOpen(true)} />{loginOpen ? <LoginScreen embedded onContinue={() => { setLoginOpen(false); setAuthError(null); }} onSession={acceptSession} developmentAuthEnabled={health?.developmentAuthEnabled === true} providerStatus={authProviders} initialError={authError} /> : null}</UiLocaleContext.Provider>;
}
