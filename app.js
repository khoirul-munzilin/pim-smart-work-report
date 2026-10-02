const cfg = window.APP_CONFIG;

if (!cfg || !cfg.SUPABASE_URL || cfg.SUPABASE_URL.includes("PROJECT")) {
  alert("Isi config.js terlebih dahulu.");
  throw new Error("Konfigurasi Supabase belum lengkap.");
}

const sb = supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);

let current = null;
let profile = null;
let reports = [];
let machines = [];
let technicians = [];
let active = null;

const $ = (id) => document.getElementById(id);

const toast = (message) => {
  const element = $("toast");
  if (!element) return;
  element.textContent = message;
  element.classList.remove("hidden");
  window.clearTimeout(toast.timer);
  toast.timer = window.setTimeout(() => element.classList.add("hidden"), 3500);
};

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function normalize(value) {
  return String(value ?? "").trim().toLowerCase();
}

async function init() {
  const { data: { session }, error } = await sb.auth.getSession();
  if (error) return toast(error.message);
  if (session) await enter(session.user);
}

$("loginForm").onsubmit = async (event) => {
  event.preventDefault();
  const { data, error } = await sb.auth.signInWithPassword({
    email: $("email").value.trim(),
    password: $("password").value
  });
  if (error) return toast(error.message);
  await enter(data.user);
};

async function enter(user) {
  current = user;
  const { data, error } = await sb.from("profiles").select("*").eq("id", user.id).single();
  if (error) return toast("Profile belum dibuat oleh Admin");

  profile = data;
  $("login").classList.add("hidden");
  $("app").classList.remove("hidden");
  $("who").textContent = `${profile.full_name} • ${profile.role}`;

  document.querySelectorAll("nav button[data-page]").forEach((button) => {
    const allowed = button.classList.contains(profile.role) || profile.role === "admin";
    button.classList.toggle("hidden", !allowed);
  });

  await load();
  show("dashboard");
}

$("logout").onclick = async () => {
  await sb.auth.signOut();
  location.reload();
};

document.querySelectorAll("[data-page]").forEach((button) => {
  button.onclick = async () => {
    if (button.dataset.page === "create") await loadTechnicians();
    show(button.dataset.page);
  };
});

function show(id) {
  document.querySelectorAll(".page").forEach((page) => page.classList.add("hidden"));
  const page = $(id);
  if (page) page.classList.remove("hidden");
  render();
}

async function loadTechnicians() {
  const select = $("technicianSelect");
  if (!select) return;

  select.innerHTML = '<option value="">Memuat technician...</option>';
  const { data, error } = await sb
    .from("profiles")
    .select("id, full_name, section")
    .eq("role", "technician")
    .order("full_name", { ascending: true });

  if (error) {
    console.error(error);
    select.innerHTML = '<option value="">Gagal memuat technician</option>';
    return toast(error.message);
  }

  technicians = data || [];
  select.innerHTML = '<option value="">Pilih technician</option>';
  technicians.forEach((technician) => {
    const option = document.createElement("option");
    option.value = technician.id;
    option.textContent = technician.section
      ? `${technician.full_name} • ${technician.section}`
      : technician.full_name;
    select.appendChild(option);
  });
}

async function load() {
  let machineQuery = sb
    .from("machines")
    .select("*")
    .eq("active", true)
    .order("machine_group", { ascending: true })
    .order("section", { ascending: true })
    .order("name", { ascending: true });

  if (profile.role === "operator") {
    const operatorGroup = String(profile.section || "").trim().toUpperCase();
    if (["RDS", "HMP", "GENERAL"].includes(operatorGroup)) {
      machineQuery = machineQuery.eq("machine_group", operatorGroup);
    } else {
      toast("Section Operator harus RDS, HMP, atau GENERAL.");
    }
  }

  let reportQuery = sb.from("reports_view").select("*").order("created_at", { ascending: false });
  if (profile.role === "technician") reportQuery = reportQuery.eq("technician_id", current.id);
  if (profile.role === "operator") reportQuery = reportQuery.eq("reporter_id", current.id);

  const [machineResult, reportResult] = await Promise.all([machineQuery, reportQuery]);
  if (machineResult.error || reportResult.error) {
    const error = machineResult.error || reportResult.error;
    console.error(error);
    return toast(error.message);
  }

  machines = machineResult.data || [];
  reports = reportResult.data || [];

  const groupDisplay = $("machineGroupDisplay");
  if (groupDisplay) {
    groupDisplay.value = profile.role === "operator"
      ? String(profile.section || "").trim().toUpperCase()
      : "SEMUA KELOMPOK";
  }

  resetMachineSelection();
  if (["operator", "admin"].includes(profile.role)) await loadTechnicians();
  render();
}

function resetMachineSelection() {
  const select = $("machineSelect");
  const input = $("machineSearchInput");
  const detail = $("machineDetail");
  const suggestions = $("machineSuggestions");
  if (select) select.innerHTML = '<option value="">Pilih mesin</option>';
  if (input) input.value = "";
  if (suggestions) {
    suggestions.innerHTML = "";
    suggestions.classList.add("hidden");
  }
  if (detail) detail.textContent = "Cari dan pilih mesin untuk menampilkan Functional Location dan Equipment Number.";
}

function machineLabel(machine) {
  return `[${machine.machine_group || "GENERAL"}] ${machine.code || ""} • ${machine.name || ""}`;
}

function renderMachineSuggestions(keyword = "") {
  const box = $("machineSuggestions");
  if (!box) return;
  const key = normalize(keyword);
  const found = machines.filter((machine) => {
    const haystack = [machine.code, machine.name, machine.section, machine.functional_location, machine.equipment_no, machine.machine_group]
      .map(normalize).join(" ");
    return !key || haystack.includes(key);
  }).slice(0, 30);

  box.innerHTML = found.map((machine) => `
    <button type="button" class="machine-option" data-machine-id="${escapeHtml(machine.id)}">
      <b>${escapeHtml(machine.code || machine.name)}</b>
      <small>${escapeHtml(machineLabel(machine))}</small>
    </button>
  `).join("") || '<div class="machine-empty">Mesin tidak ditemukan.</div>';
  box.classList.remove("hidden");

  box.querySelectorAll("[data-machine-id]").forEach((button) => {
    button.onclick = () => selectMachine(button.dataset.machineId);
  });
}

function selectMachine(id) {
  const machine = machines.find((item) => String(item.id) === String(id));
  if (!machine) return toast("Data mesin tidak ditemukan.");

  const select = $("machineSelect");
  select.innerHTML = `<option value="${escapeHtml(machine.id)}" selected>${escapeHtml(machineLabel(machine))}</option>`;
  select.value = String(machine.id);
  $("machineSearchInput").value = machineLabel(machine);
  $("machineSuggestions").classList.add("hidden");
  $("machineDetail").innerHTML = `
    <b>${escapeHtml(machine.code || machine.name)}</b>
    <p>Nama: ${escapeHtml(machine.name || "-")}</p>
    <p>Group: ${escapeHtml(machine.machine_group || "-")}</p>
    <p>Area/Section: ${escapeHtml(machine.section || "-")}</p>
    <p>Functional Location: ${escapeHtml(machine.functional_location || "-")}</p>
    <p>Equipment No.: ${escapeHtml(machine.equipment_no || "-")}</p>
  `;
}

$("machineSearchInput").addEventListener("input", (event) => {
  $("machineSelect").value = "";
  renderMachineSuggestions(event.target.value);
});
$("machineSearchInput").addEventListener("focus", (event) => renderMachineSuggestions(event.target.value));
document.addEventListener("click", (event) => {
  if (!event.target.closest(".machine-search-wrap")) $("machineSuggestions").classList.add("hidden");
});

function render() {
  const openCount = reports.filter((item) => item.status === "OPEN").length;
  const closedCount = reports.filter((item) => item.status === "CLOSED").length;
  $("total").textContent = reports.length;
  $("open").textContent = openCount;
  $("closed").textContent = closedCount;
  $("progress").textContent = reports.length - openCount - closedCount;
  $("latest").innerHTML = reports.slice(0, 10).map(card).join("") || "Belum ada data";

  const jobs = reports.filter((item) => {
    const activeStatus = ["OPEN", "IN_PROGRESS", "RETURNED"].includes(item.status);
    return activeStatus && (profile.role === "admin" || item.technician_id === current.id);
  });

  $("jobList").innerHTML = jobs.map((item) => `
    <article class="card job">
      <span class="badge">${escapeHtml(item.status)}</span>
      <h3>${escapeHtml(item.report_no)} • ${escapeHtml(item.machine_name)}</h3>
      <p>${escapeHtml(item.problem)}</p>
      <p><b>Technician:</b> ${escapeHtml(item.technician_name || "-")}</p>
      <button type="button" onclick="startWork('${escapeHtml(item.id)}')">MULAI / LANJUTKAN</button>
      ${profile.role === "admin" ? `<button type="button" class="green" onclick="adminCloseJob('${escapeHtml(item.id)}')">ADMIN CLOSE</button>` : ""}
    </article>
  `).join("") || '<div class="card">Tidak ada pekerjaan.</div>';

  $("verifyList").innerHTML = reports.filter((item) => item.status === "REQUEST_CHECK").map((item) => `
    <article class="card job">
      <span class="badge">REQUEST CHECK</span>
      <h3>${escapeHtml(item.report_no)} • ${escapeHtml(item.machine_name)}</h3>
      <p>${escapeHtml(item.action || "")}</p>
      <button type="button" onclick="startVerify('${escapeHtml(item.id)}')">CEK HASIL</button>
    </article>
  `).join("") || '<div class="card">Belum ada Request Check.</div>';

  $("reportRows").innerHTML = reports.map((item) => `
    <tr><td>${escapeHtml(item.report_no)}</td><td>${escapeHtml(item.machine_name)}</td><td>${escapeHtml(item.problem)}</td><td>${escapeHtml(item.status)}</td><td>${escapeHtml(item.technician_name || "-")}</td></tr>
  `).join("");
}

function card(item) {
  return `<p><span class="badge">${escapeHtml(item.status)}</span> <b>${escapeHtml(item.report_no)} • ${escapeHtml(item.machine_name)}</b><br>${escapeHtml(item.problem)}</p>`;
}

async function upload(file, reportId, stage) {
  if (!file || !file.name || !file.size) return null;
  const extension = file.name.split(".").pop();
  const path = `${reportId}/${stage}-${Date.now()}.${extension}`;
  const { error } = await sb.storage.from("work-photos").upload(path, file, { contentType: file.type });
  if (error) throw error;
  const { error: photoError } = await sb.from("photos").insert({ report_id: reportId, stage, path });
  if (photoError) throw photoError;
  return path;
}

$("createForm").onsubmit = async (event) => {
  event.preventDefault();
  try {
    const formData = new FormData(event.target);
    const machineId = formData.get("machine_id");
    const technicianId = formData.get("technician_id");
    if (!machineId) throw new Error("Cari dan pilih mesin terlebih dahulu.");
    if (!technicianId) throw new Error("Pilih technician terlebih dahulu.");

    const reportNumber = `RPT-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-${String(Date.now()).slice(-5)}`;
    const { data, error } = await sb.from("reports").insert({
      report_no: reportNumber,
      machine_id: machineId,
      reporter_id: current.id,
      technician_id: technicianId,
      shift: formData.get("shift"),
      priority: formData.get("priority"),
      request_type: formData.get("request_type"),
      problem: formData.get("problem"),
      impact: formData.get("impact"),
      status: "OPEN"
    }).select().single();
    if (error) throw error;

    await upload(formData.get("photo"), data.id, "PROBLEM");
    event.target.reset();
    await load();
    show("dashboard");
    toast("Laporan berhasil dikirim ke technician");
  } catch (error) {
    console.error(error);
    toast(error.message);
  }
};

window.startWork = async (id) => {
  active = reports.find((item) => item.id === id);
  if (!active) return toast("Pekerjaan tidak ditemukan.");
  const isAdmin = profile.role === "admin";
  if (!isAdmin && active.technician_id !== current.id) return toast("Pekerjaan ini ditugaskan kepada technician lain.");

  if (active.status !== "IN_PROGRESS") {
    let query = sb.from("reports").update({ status: "IN_PROGRESS", start_at: active.start_at || new Date().toISOString() }).eq("id", id);
    if (!isAdmin) query = query.eq("technician_id", current.id);
    const { error } = await query;
    if (error) return toast(error.message);
    active.status = "IN_PROGRESS";
  }

  $("workTitle").innerHTML = `<b>${escapeHtml(active.report_no)} • ${escapeHtml(active.machine_name)}</b><p>${escapeHtml(active.problem)}</p><p><b>Technician:</b> ${escapeHtml(active.technician_name || "-")}</p>`;
  show("work");
};

$("workForm").onsubmit = async (event) => {
  event.preventDefault();
  try {
    const formData = new FormData(event.target);
    let query = sb.from("reports").update({
      cause: formData.get("cause"), action: formData.get("action"), spare_part: formData.get("spare_part"), tech_note: formData.get("tech_note"),
      status: "REQUEST_CHECK", request_check_at: new Date().toISOString()
    }).eq("id", active.id);
    if (profile.role !== "admin") query = query.eq("technician_id", current.id);
    const { error } = await query;
    if (error) throw error;
    await upload(formData.get("photo"), active.id, "AFTER_REPAIR");
    event.target.reset();
    await load();
    show("jobs");
    toast("Request Check dikirim");
  } catch (error) { console.error(error); toast(error.message); }
};

window.startVerify = (id) => {
  active = reports.find((item) => item.id === id);
  if (!active) return toast("Laporan tidak ditemukan.");
  $("verifyTitle").innerHTML = `<b>${escapeHtml(active.report_no)} • ${escapeHtml(active.machine_name)}</b><p>${escapeHtml(active.action || "")}</p>`;
  show("verifyFormPage");
};

$("verifyForm").onsubmit = async (event) => {
  event.preventDefault();
  try {
    const formData = new FormData(event.target);
    const decision = event.submitter.value;
    if (decision === "CLOSED" && formData.get("production_test") !== "NORMAL") throw new Error("Hasil harus NORMAL untuk Closed");
    const { error } = await sb.from("reports").update({
      production_test: formData.get("production_test"), production_note: formData.get("production_note"), status: decision,
      verifier_id: current.id, verified_at: new Date().toISOString(), closed_at: decision === "CLOSED" ? new Date().toISOString() : null
    }).eq("id", active.id);
    if (error) throw error;
    await upload(formData.get("photo"), active.id, "VERIFICATION");
    event.target.reset();
    await load();
    show("dashboard");
    toast(decision === "CLOSED" ? "Report Closed" : "Dikembalikan");
  } catch (error) { console.error(error); toast(error.message); }
};

window.adminCloseJob = async (id) => {
  if (profile.role !== "admin") return toast("Khusus Administrator.");
  const item = reports.find((report) => report.id === id);
  if (!item) return toast("Pekerjaan tidak ditemukan.");
  const note = prompt(`Catatan penutupan ${item.report_no}:`);
  if (!note || !note.trim()) return toast("Catatan penutupan wajib diisi.");
  if (!confirm(`Tutup pekerjaan ${item.report_no}?`)) return;
  const { error } = await sb.from("reports").update({
    status: "CLOSED", verifier_id: current.id, production_test: "NORMAL", production_note: note.trim(),
    verified_at: new Date().toISOString(), closed_at: new Date().toISOString()
  }).eq("id", id);
  if (error) return toast(error.message);
  await load();
  show("jobs");
  toast("Pekerjaan berhasil ditutup Administrator.");
};

$("machineForm").onsubmit = async (event) => {
  event.preventDefault();
  const formData = new FormData(event.target);
  const { error } = await sb.from("machines").insert({
    code: formData.get("code").trim().toUpperCase(), name: formData.get("name").trim(), section: formData.get("section").trim(),
    machine_group: formData.get("machine_group"), active: true
  });
  if (error) return toast(error.message);
  event.target.reset();
  await load();
  toast("Mesin disimpan");
};

$("downloadExcel").onclick = async () => {
  try {
    const date = $("reportDate").value;

    if (!date) {
      throw new Error("Pilih tanggal report terlebih dahulu.");
    }

    toast("Menyiapkan Excel dan dokumentasi...");

    /*
     * Ambil langsung dari reports_view.
     * Jangan hanya memakai array reports karena data dapat terfilter role.
     */
    const startDate = new Date(`${date}T00:00:00`);
    const endDate = new Date(`${date}T00:00:00`);

    endDate.setDate(endDate.getDate() + 1);

    const { data: rows, error: reportError } = await sb
      .from("reports_view")
      .select("*")
      .gte("created_at", startDate.toISOString())
      .lt("created_at", endDate.toISOString())
      .order("created_at", {
        ascending: true
      });

    if (reportError) {
      throw reportError;
    }

    if (!rows || rows.length === 0) {
      throw new Error(
        "Tidak ada Maintenance Request pada tanggal tersebut."
      );
    }

    const workbook = new ExcelJS.Workbook();

    /*
     * SHEET DETAIL
     */
    const detailSheet =
      workbook.addWorksheet("Maintenance Request");

    detailSheet.views = [
      {
        state: "frozen",
        ySplit: 1
      }
    ];

    detailSheet.columns = [
      { header: "No.", key: "no", width: 7 },
      {
        header: "Nomor Request",
        key: "report_no",
        width: 24
      },
      {
        header: "Tanggal",
        key: "created_at",
        width: 22
      },
      {
        header: "Jenis Pekerjaan",
        key: "request_type",
        width: 20
      },
      {
        header: "Mesin",
        key: "machine_name",
        width: 28
      },
      {
        header: "Machine Group",
        key: "machine_group",
        width: 18
      },
      {
        header: "Section",
        key: "section",
        width: 24
      },
      {
        header: "Functional Location",
        key: "functional_location",
        width: 45
      },
      {
        header: "Equipment Number",
        key: "equipment_number",
        width: 25
      },
      {
        header: "Shift",
        key: "shift",
        width: 15
      },
      {
        header: "Prioritas",
        key: "priority",
        width: 15
      },
      {
        header: "Deskripsi Kerusakan",
        key: "problem",
        width: 42
      },
      {
        header: "Dampak Operasional",
        key: "impact",
        width: 38
      },
      {
        header: "Status",
        key: "status",
        width: 18
      },
      {
        header: "Pelapor",
        key: "reporter_name",
        width: 24
      },
      {
        header: "Technician",
        key: "technician_name",
        width: 24
      },
      {
        header: "Penyebab",
        key: "cause",
        width: 38
      },
      {
        header: "Tindakan",
        key: "action",
        width: 42
      },
      {
        header: "Spare Part",
        key: "spare_part",
        width: 28
      },
      {
        header: "Catatan Technician",
        key: "tech_note",
        width: 38
      },
      {
        header: "Hasil Test",
        key: "production_test",
        width: 18
      },
      {
        header: "Catatan Verifikasi",
        key: "production_note",
        width: 38
      },
      {
        header: "Waktu Mulai",
        key: "start_at",
        width: 22
      },
      {
        header: "Request Verification",
        key: "request_check_at",
        width: 22
      },
      {
        header: "Waktu Closed",
        key: "closed_at",
        width: 22
      }
    ];

    function formatDate(value) {
      if (!value) {
        return "";
      }

      const parsed = new Date(value);

      if (Number.isNaN(parsed.getTime())) {
        return value;
      }

      return parsed.toLocaleString("id-ID");
    }

    rows.forEach((report, index) => {
      detailSheet.addRow({
        no: index + 1,
        report_no: report.report_no || "",
        created_at: formatDate(report.created_at),
        request_type: report.request_type || "",
        machine_name: report.machine_name || "",
        machine_group: report.machine_group || "",
        section:
          report.section ||
          report.plant_area ||
          "",
        functional_location:
          report.functional_location ||
          report.function_location ||
          "",
        equipment_number:
          report.sap_equipment ||
          report.equipment_no ||
          report.equipment_number ||
          "",
        shift: report.shift || "",
        priority: report.priority || "",
        problem: report.problem || "",
        impact: report.impact || "",
        status: report.status || "",
        reporter_name: report.reporter_name || "",
        technician_name:
          report.technician_name || "",
        cause: report.cause || "",
        action: report.action || "",
        spare_part: report.spare_part || "",
        tech_note: report.tech_note || "",
        production_test:
          report.production_test || "",
        production_note:
          report.production_note || "",
        start_at: formatDate(report.start_at),
        request_check_at:
          formatDate(report.request_check_at),
        closed_at: formatDate(report.closed_at)
      });
    });

    const header = detailSheet.getRow(1);

    header.height = 30;
    header.font = {
      bold: true,
      color: {
        argb: "FFFFFFFF"
      }
    };

    header.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: {
        argb: "FF17365D"
      }
    };

    header.alignment = {
      horizontal: "center",
      vertical: "middle",
      wrapText: true
    };

    detailSheet.eachRow((row, rowNumber) => {
      if (rowNumber > 1) {
        row.alignment = {
          vertical: "top",
          wrapText: true
        };
      }
    });

    detailSheet.autoFilter = {
      from: "A1",
      to: "Y1"
    };

    /*
     * SHEET DOKUMENTASI
     */
    const photoSheet =
      workbook.addWorksheet("Dokumentasi");

    photoSheet.getColumn("A").width = 34;
    photoSheet.getColumn("B").width = 4;
    photoSheet.getColumn("C").width = 34;
    photoSheet.getColumn("D").width = 4;
    photoSheet.getColumn("E").width = 34;

    let currentRow = 1;

    for (const report of rows) {
      photoSheet.mergeCells(
        currentRow,
        1,
        currentRow,
        5
      );

      const title =
        photoSheet.getCell(currentRow, 1);

      title.value =
        `${report.report_no} • ` +
        `${report.machine_name || "-"}`;

      title.font = {
        bold: true,
        color: {
          argb: "FFFFFFFF"
        },
        size: 13
      };

      title.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: {
          argb: "FF17365D"
        }
      };

      title.alignment = {
        vertical: "middle"
      };

      photoSheet.getCell(
        currentRow + 1,
        1
      ).value = "Kondisi Awal";

      photoSheet.getCell(
        currentRow + 1,
        3
      ).value = "Hasil Pekerjaan";

      photoSheet.getCell(
        currentRow + 1,
        5
      ).value = "Verifikasi";

      [
        photoSheet.getCell(currentRow + 1, 1),
        photoSheet.getCell(currentRow + 1, 3),
        photoSheet.getCell(currentRow + 1, 5)
      ].forEach((cell) => {
        cell.font = {
          bold: true
        };

        cell.alignment = {
          horizontal: "center"
        };
      });

      const { data: photos, error: photoError } =
        await sb
          .from("photos")
          .select("stage, path")
          .eq("report_id", report.id);

      if (photoError) {
        throw photoError;
      }

      const stageColumns = {
        PROBLEM: 1,
        AFTER_REPAIR: 3,
        VERIFICATION: 5
      };

      for (const photo of photos || []) {
        const targetColumn =
          stageColumns[photo.stage];

        if (!targetColumn) {
          continue;
        }

        try {
          const {
            data: signed,
            error: signedError
          } = await sb.storage
            .from("work-photos")
            .createSignedUrl(
              photo.path,
              180
            );

          if (signedError) {
            throw signedError;
          }

          const response = await fetch(
            signed.signedUrl
          );

          if (!response.ok) {
            throw new Error(
              "Dokumentasi gagal diunduh."
            );
          }

          const photoBlob =
            await response.blob();

          const photoBuffer =
            await photoBlob.arrayBuffer();

          const extension =
            photoBlob.type.includes("png")
              ? "png"
              : "jpeg";

          const imageId =
            workbook.addImage({
              buffer: photoBuffer,
              extension
            });

          photoSheet.addImage(imageId, {
            tl: {
              col: targetColumn - 1,
              row: currentRow + 1
            },
            ext: {
              width: 240,
              height: 180
            }
          });
        } catch (photoError) {
          console.error(
            "Dokumentasi gagal dimuat:",
            photoError
          );

          photoSheet.getCell(
            currentRow + 3,
            targetColumn
          ).value =
            "Dokumentasi tidak dapat dimuat";
        }
      }

      for (
        let rowNumber = currentRow + 2;
        rowNumber <= currentRow + 11;
        rowNumber++
      ) {
        photoSheet.getRow(rowNumber).height = 18;
      }

      currentRow += 13;
    }

    /*
     * DOWNLOAD EXCEL
     */
    const excelBuffer =
      await workbook.xlsx.writeBuffer();

    const excelBlob = new Blob(
      [excelBuffer],
      {
        type:
          "application/vnd.openxmlformats-" +
          "officedocument.spreadsheetml.sheet"
      }
    );

    const link =
      document.createElement("a");

    link.href =
      URL.createObjectURL(excelBlob);

    link.download =
      `Maintenance_Request_${date}.xlsx`;

    document.body.appendChild(link);
    link.click();
    link.remove();

    window.setTimeout(() => {
      URL.revokeObjectURL(link.href);
    }, 1000);

    toast(
      `${rows.length} request berhasil diekspor`
    );
  } catch (error) {
    console.error(
      "Gagal membuat Excel:",
      error
    );

    toast(error.message);
  }
};

$("reportDate").value = new Date().toISOString().slice(0, 10);
init();
