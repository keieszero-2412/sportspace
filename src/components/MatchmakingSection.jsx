import React, { useEffect, useRef, useState } from "react";
import { api, watch } from "../services/api";
import { localDate, normalize } from "../../functions/domain";
import { useToast } from "./ToastContext";
import ConfirmModal from "./ConfirmModal";
import AsyncStatus from "./AsyncStatus";
import { getCurrentPosition, getDistance } from "../utils/geo";
export default function MatchmakingSection({
  lang = "vi",
  userProfile,
  onRequireAuth,
}) {
  const tr = (vi, en) => (lang === "vi" ? vi : en),
    { showError, showSuccess } = useToast();
  const [matches, setMatches] = useState([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(null),
    [retry, setRetry] = useState(0);
  const [sport, setSport] = useState("ALL"),
    [dateFilter, setDateFilter] = useState("ALL"),
    [maxDistance, setMaxDistance] = useState("ALL"),
    [userLocation, setUserLocation] = useState(null),
    [showForm, setShowForm] = useState(false),
    [busy, setBusy] = useState(false),
    [confirm, setConfirm] = useState(null);
  const blank = () => ({
    title: "",
    sport: "Pickleball",
    province: "",
    venueName: "",
    date: localDate(),
    startTime: "",
    endTime: "",
    playersMax: 4,
    costPerPerson: 0,
    levelRequired: "",
  });
  const [form, setForm] = useState(blank),
    [editingId, setEditingId] = useState(null);
  const key = useRef(crypto.randomUUID());
  useEffect(() => {
    setLoading(true);
    setError(null);
    return watch(
      "Matches",
      [
        ["status", "==", "open"],
        ["startAt", ">", Date.now()],
      ],
      (v) => {
        setMatches(v);
        setLoading(false);
      },
      (e) => {
        setError(e);
        setLoading(false);
      },
      { order: "startAt", direction: "asc", limit: 100 },
    );
  }, [retry]);
  async function create(e) {
    e.preventDefault();
    if (busy) return;
    if (!userProfile) {
      onRequireAuth();
      return;
    }
    setBusy(true);
    try {
      await api(editingId ? "editMatch" : "createMatch", {
        ...form,
        key: key.current,
        matchId: editingId,
      });
      setShowForm(false);
      setEditingId(null);
      setForm(blank());
      key.current = crypto.randomUUID();
      showSuccess(tr("Đã lưu kèo.", "Match saved."));
    } catch (e) {
      showError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function change(m, operation) {
    if (!userProfile) {
      onRequireAuth();
      return;
    }
    if (busy) return;
    setBusy(true);
    try {
      await api("matchTransition", { matchId: m.id, operation });
      setConfirm(null);
    } catch (e) {
      showError(e.message);
    } finally {
      setBusy(false);
    }
  }
  const visible = matches.filter((m) => {
    if (m.startAt <= Date.now()) return false;
    if (sport !== "ALL" && m.sport !== sport) return false;
    
    if (dateFilter !== "ALL") {
      const msPerDay = 24 * 60 * 60 * 1000;
      const today = new Date().setHours(0,0,0,0);
      const matchDay = new Date(m.startAt).setHours(0,0,0,0);
      const diff = (matchDay - today) / msPerDay;

      if (dateFilter === "today" && diff !== 0) return false;
      if (dateFilter === "tomorrow" && diff !== 1) return false;
      if (dateFilter === "3days" && (diff < 0 || diff > 3)) return false;
      if (dateFilter === "1week" && (diff < 0 || diff > 7)) return false;
    }

    if (maxDistance !== "ALL" && userLocation) {
      const dist = getDistance(userLocation.lat, userLocation.lng, m.lat, m.lng);
      if (dist === null || dist > Number(maxDistance)) return false;
    }

    return true;
  });
  const sports = [
    "Pickleball",
    "Bóng đá",
    "Cầu lông",
    "Tennis",
    "Bóng rổ",
    "Bóng bàn",
    "Bóng chuyền",
  ];
  return (
    <section
      id="matchmaking-section"
      className="container booking-flow"
      style={{ padding: "32px 20px" }}
    >
      <div className="form-row">
        <h2>{tr("Ghép đội và giao lưu", "Find a match")}</h2>
        <button
          className="btn btn-primary"
          onClick={() => {
            if (!userProfile) {
              onRequireAuth();
              return;
            }
            setEditingId(null);
            setForm(blank());
            key.current = crypto.randomUUID();
            setShowForm(true);
          }}
        >
          {tr("Tạo kèo", "Create match")}
        </button>
        <select value={sport} onChange={(e) => setSport(e.target.value)}>
          <option value="ALL">{tr("Tất cả môn", "All sports")}</option>
          {sports.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        <select value={dateFilter} onChange={(e) => setDateFilter(e.target.value)}>
          <option value="ALL">{tr("Mọi ngày", "Any day")}</option>
          <option value="today">{tr("Hôm nay", "Today")}</option>
          <option value="tomorrow">{tr("Ngày mai", "Tomorrow")}</option>
          <option value="3days">{tr("3 ngày tới", "Next 3 days")}</option>
          <option value="1week">{tr("1 tuần tới", "Next 7 days")}</option>
        </select>
        <select
          value={maxDistance}
          onChange={async (e) => {
            const val = e.target.value;
            if (val !== "ALL" && !userLocation) {
              try {
                const loc = await getCurrentPosition();
                setUserLocation(loc);
              } catch (err) {
                showError(err.message || tr("Không lấy được vị trí của bạn", "Could not get your location"));
                return;
              }
            }
            setMaxDistance(val);
          }}
        >
          <option value="ALL">{tr("Mọi khoảng cách", "Any distance")}</option>
          <option value="5">{tr("Dưới 5 km", "Under 5 km")}</option>
          <option value="10">{tr("Dưới 10 km", "Under 10 km")}</option>
          <option value="20">{tr("Dưới 20 km", "Under 20 km")}</option>
        </select>
      </div>
      <AsyncStatus
        loading={loading}
        error={error}
        retry={() => setRetry((v) => v + 1)}
        empty={!loading && !visible.length}
        lang={lang}
      />
      <div className="feature-grid">
        {visible.map((m) => {
          const joined = (m.joinedUsers || []).includes(userProfile?.uid),
            host = m.hostId === userProfile?.uid;
          return (
            <article className="glass-panel feature-card" key={m.id}>
              <span className="badge">
                {m.sport} · {m.province}
              </span>
              <h3>{m.title}</h3>
              <p>{m.venueName}</p>
              <p>
                {new Date(m.startAt).toLocaleString(
                  lang === "vi" ? "vi-VN" : "en-GB",
                  { timeZone: "Asia/Ho_Chi_Minh" },
                )}{" "}
                · {m.time}
              </p>
              <p>
                {tr("Trình độ", "Skill")}: {m.levelRequired}
              </p>
              <p>
                Host: {m.hostName} · {m.hostCredibility ?? 0}{" "}
                {tr("điểm", "pts")}
              </p>
              <p>
                {typeof m.costPerPerson === "number"
                  ? m.costPerPerson.toLocaleString() + " VND"
                  : String(
                      m.costPerPerson ?? m.cost ?? tr("Chưa có", "Unavailable"),
                    )}{" "}
                / {tr("người", "player")} · {m.playersJoined}/{m.playersMax}
              </p>
              {joined && (
                <p>
                  {tr("Thành viên", "Members")}:{" "}
                  {(m.joinedUsers || [])
                    .map(
                      (u) => m.memberNames?.[u] || tr("Người chơi", "Player"),
                    )
                    .join(", ")}
                </p>
              )}
              <div className="form-row">
                {host ? (
                  <>
                    <button
                      disabled={busy}
                      className="btn btn-outline"
                      onClick={() => {
                        setEditingId(m.id);
                        setForm({
                          ...m,
                          startTime: m.time.split(" - ")[0],
                          endTime: m.time.split(" - ")[1],
                        });
                        setShowForm(true);
                      }}
                    >
                      {tr("Sửa kèo", "Edit match")}
                    </button>
                    <button
                      disabled={busy}
                      className="btn btn-outline"
                      onClick={() => setConfirm(m)}
                    >
                      {tr("Hủy kèo", "Cancel match")}
                    </button>
                  </>
                ) : joined ? (
                  <button
                    disabled={busy}
                    className="btn btn-outline"
                    onClick={() => change(m, "leave")}
                  >
                    {tr("Rời kèo", "Leave")}
                  </button>
                ) : (
                  <button
                    className="btn btn-primary"
                    disabled={busy || m.playersJoined >= m.playersMax}
                    onClick={() => change(m, "join")}
                  >
                    {tr("Tham gia", "Join")}
                  </button>
                )}
              </div>
            </article>
          );
        })}
      </div>
      {showForm && (
        <div
          className="modal-overlay"
          onClick={() => !busy && setShowForm(false)}
        >
          <form
            className="modal-content booking-flow"
            onClick={(e) => e.stopPropagation()}
            onSubmit={create}
          >
            <h3>{tr("Tạo kèo giao lưu", "Create a match")}</h3>
            {Object.entries({
              title: tr("Tiêu đề", "Title"),
              province: tr("Tỉnh/thành", "Province"),
              venueName: tr("Tên sân", "Venue"),
              levelRequired: tr("Trình độ", "Skill"),
            }).map(([k, label]) => (
              <label key={k}>
                {label}
                <input
                  required
                  maxLength={150}
                  value={form[k]}
                  onChange={(e) => setForm({ ...form, [k]: e.target.value })}
                />
              </label>
            ))}
            <label>
              {tr("Bộ môn", "Sport")}
              <select
                value={form.sport}
                onChange={(e) => setForm({ ...form, sport: e.target.value })}
              >
                {sports.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </label>
            <div className="form-row">
              <label>
                {tr("Ngày", "Date")}
                <input
                  type="date"
                  required
                  min={localDate()}
                  value={form.date}
                  onChange={(e) => setForm({ ...form, date: e.target.value })}
                />
              </label>
              <label>
                {tr("Bắt đầu", "Start")}
                <input
                  type="time"
                  required
                  value={form.startTime}
                  onChange={(e) =>
                    setForm({ ...form, startTime: e.target.value })
                  }
                />
              </label>
              <label>
                {tr("Kết thúc", "End")}
                <input
                  type="time"
                  required
                  value={form.endTime}
                  onChange={(e) =>
                    setForm({ ...form, endTime: e.target.value })
                  }
                />
              </label>
            </div>
            <div className="form-row">
              <label>
                {tr("Tổng người", "Capacity")}
                <input
                  type="number"
                  min={2}
                  max={22}
                  required
                  value={form.playersMax}
                  onChange={(e) =>
                    setForm({ ...form, playersMax: Number(e.target.value) })
                  }
                />
              </label>
              <label>
                {tr("Chi phí/người (VND)", "Cost/player (VND)")}
                <input
                  type="number"
                  min={0}
                  step={1}
                  required
                  value={form.costPerPerson}
                  onChange={(e) =>
                    setForm({ ...form, costPerPerson: Number(e.target.value) })
                  }
                />
              </label>
            </div>
            <div className="form-row">
              <button
                type="button"
                disabled={busy}
                className="btn btn-outline"
                onClick={() => setShowForm(false)}
              >
                {tr("Đóng", "Close")}
              </button>
              <button disabled={busy} className="btn btn-primary">
                {tr("Đăng kèo", "Publish")}
              </button>
            </div>
          </form>
        </div>
      )}
      <ConfirmModal
        isOpen={!!confirm}
        title={tr("Hủy kèo", "Cancel match")}
        message={tr(
          "Các thành viên sẽ nhận thông báo hủy.",
          "Members will be notified.",
        )}
        onClose={() => !busy && setConfirm(null)}
        onConfirm={() => !busy && change(confirm, "cancel")}
      />
    </section>
  );
}
