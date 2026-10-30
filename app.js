// ---------- 공통 도우미 ----------
async function api(path, options = {}) {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    let detail = "";
    try {
      const body = await res.json();
      detail = typeof body.detail === "string" ? body.detail : JSON.stringify(body.detail);
    } catch (e) {}
    throw new Error(detail || `요청 실패 (${res.status})`);
  }
  return res.json();
}

// ---------- 데이터 요약 ----------
async function loadSummary() {
  const box = document.getElementById("summary");
  try {
    const s = await api("/api/data/summary");
    const m = s.metrics || {};
    box.innerHTML = `
      <p>기간: ${s.period}</p>
      <p>데이터 개수: ${s.count}개</p>
      <p>평균: ${m.average}원 / 최고: ${m.max}원 (${m.max_date}) / 최저: ${m.min}원 (${m.min_date})</p>
      <p>최근 추세: ${s.trend}</p>
    `;
  } catch (e) {
    box.textContent = "요약을 불러오지 못했어요: " + e.message;
  }
}

// ---------- 데이터 관리 ----------
// 목록이 1,494개로 길어서 최근 20개만 보여줘요.
async function loadData() {
  const list = document.getElementById("data-list");
  list.innerHTML = "";
  try {
    const rows = await api("/api/data");
    rows.slice(-20).reverse().forEach((row) => {
      const li = document.createElement("li");
      li.textContent = `${row.date} | ${row.value}원 ${row.memo ? "| " + row.memo : ""} `;

      const editBtn = document.createElement("button");
      editBtn.textContent = "수정";
      editBtn.onclick = () => editData(row);

      const delBtn = document.createElement("button");
      delBtn.textContent = "삭제";
      delBtn.onclick = () => deleteData(row.id);

      li.append(editBtn, delBtn);
      list.appendChild(li);
    });
  } catch (e) {
    list.textContent = "목록을 불러오지 못했어요: " + e.message;
  }
}

async function editData(row) {
  const input = prompt("새 환율 값을 입력하세요", row.value);
  if (input === null) return;
  const value = parseFloat(input);
  if (Number.isNaN(value)) {
    alert("숫자만 입력할 수 있어요.");
    return;
  }
  try {
    await api(`/api/data/${row.id}`, { method: "PUT", body: JSON.stringify({ value }) });
    await Promise.all([loadData(), loadSummary()]);
  } catch (e) {
    alert("수정에 실패했어요: " + e.message);
  }
}

async function deleteData(id) {
  if (!confirm("이 데이터를 삭제할까요?")) return;
  try {
    await api(`/api/data/${id}`, { method: "DELETE" });
    await Promise.all([loadData(), loadSummary()]);
  } catch (e) {
    alert("삭제에 실패했어요: " + e.message);
  }
}

document.getElementById("data-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const body = {
    date: document.getElementById("data-date").value,
    value: parseFloat(document.getElementById("data-value").value),
    memo: document.getElementById("data-memo").value,
  };
  try {
    await api("/api/data", { method: "POST", body: JSON.stringify(body) });
    event.target.reset();
    await Promise.all([loadData(), loadSummary()]);
  } catch (e) {
    alert("추가에 실패했어요: " + e.message);
  }
});
// ---------- AI 채팅 ----------
let currentConversationId = null;

function addMessage(role, text) {
  const box = document.getElementById("chat-box");
  const p = document.createElement("p");
  p.textContent = (role === "user" ? "나: " : "AI: ") + text;
  box.appendChild(p);
  box.scrollTop = box.scrollHeight;
}

document.getElementById("chat-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const input = document.getElementById("chat-input");
  const question = input.value.trim();
  if (!question) return;

  addMessage("user", question);
  input.value = "";

  const loading = document.getElementById("loading");
  const button = event.target.querySelector("button");
  loading.hidden = false;
  button.disabled = true;

  try {
    const body = { question };
    if (currentConversationId) body.conversation_id = currentConversationId;
    const result = await api("/api/chat", { method: "POST", body: JSON.stringify(body) });
    currentConversationId = result.conversation_id;
    addMessage("assistant", result.answer);
    loadConversations();
  } catch (e) {
    addMessage("assistant", "답변을 받지 못했어요. " + e.message);
  } finally {
    loading.hidden = true;
    button.disabled = false;
  }
});
// ---------- 대화 기록 ----------
async function loadConversations() {
  const list = document.getElementById("conversation-list");
  list.innerHTML = "";
  try {
    const rows = await api("/api/conversations");
    if (rows.length === 0) {
      list.textContent = "저장된 대화가 없어요.";
      return;
    }
    rows.forEach((conv) => {
      const li = document.createElement("li");
      li.textContent = `${conv.title} (${conv.message_count}개 메시지) `;

      const openBtn = document.createElement("button");
      openBtn.textContent = "불러오기";
      openBtn.onclick = () => openConversation(conv.id);

      const delBtn = document.createElement("button");
      delBtn.textContent = "삭제";
      delBtn.onclick = () => deleteConversation(conv.id);

      li.append(openBtn, delBtn);
      list.appendChild(li);
    });
  } catch (e) {
    list.textContent = "대화 기록을 불러오지 못했어요: " + e.message;
  }
}

async function openConversation(id) {
  try {
    const conv = await api(`/api/conversations/${id}`);
    const box = document.getElementById("chat-box");
    box.innerHTML = "";
    conv.messages.forEach((m) => addMessage(m.role, m.content));
    currentConversationId = id;   // 이어서 질문하면 이 대화에 계속 저장돼요
  } catch (e) {
    alert("대화를 불러오지 못했어요: " + e.message);
  }
}

async function deleteConversation(id) {
  if (!confirm("이 대화를 삭제할까요?")) return;
  try {
    await api(`/api/conversations/${id}`, { method: "DELETE" });
    if (currentConversationId === id) {
      currentConversationId = null;
      document.getElementById("chat-box").innerHTML = "";
    }
    await loadConversations();
  } catch (e) {
    alert("삭제에 실패했어요: " + e.message);
  }
}
// ---------- 시작할 때 실행 ----------
loadSummary();
loadData();
loadConversations();