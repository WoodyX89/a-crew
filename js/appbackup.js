// ================================================
// app.js - CLEAN & ORGANIZED VERSION
// ================================================

const supabaseClient = supabase.createClient(
  'https://bwfwnpdjeovqeznwbckx.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ3ZnducGRqZW92cWV6bndiY2t4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYxOTI2NzIsImV4cCI6MjA5MTc2ODY3Mn0.QohjsfSgvw64ZwSLRCtr_4rh49JyInEmrpDdzrXISQU'
);

// ====================== 1. CONSTANTS ======================
const rotationCycle = 28;
const workingDaysInCycle = [false,false,true,true,true,true,true,false,false,false,false,false,true,true,true,true,false,false,false,false,false,true,true,true,true,true,true,false,false];
const rotationStartDate = new Date('2025-01-01');

const FIXED_AREAS = [
    { key: "Supervisor", label: "Supervisor" },
    { key: "LH",         label: "LH" },
    { key: "Pretreat",   label: "Pretreat" },
    { key: "Demin",      label: "Demin" },
    { key: "Field 1",    label: "Field 1" },
    { key: "Field 2",    label: "Field 2" },
    { key: "Comp 1",     label: "Comp 1" },
    { key: "Comp 2",     label: "Comp 2" },
    { key: "Panel 1",    label: "Panel 1" },
    { key: "Panel 2",    label: "Panel 2" }
];

const trevorUserId = "2f461757-567a-4ec7-8c9d-fa97138265e5";

// ====================== 2. GLOBAL VARIABLES ======================
let currentUser = null;
let currentDate = new Date();
let scheduleData = {};
let eventsThisMonth = {};
let selectedDays = [];
let isDragging = false;
let multiSelectActive = false;
let currentBulkTab = 0;
let currentEditingOTId = null;
let memberShiftChartInstance = null;
let shiftAreaChartInstance = null;
let feedChannel = null;
let golfChannel = null;
let currentSort = 'latest';
let pollOptions = ["", ""];

// ====================== 3. HELPER FUNCTIONS ======================
function isWorkingDay(dateStr) {
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return false;
  const diffTime = date.getTime() - rotationStartDate.getTime();
  const diffDays = Math.floor(diffTime / (1000 * 3600 * 24));
  const cycleDay = ((diffDays % rotationCycle) + rotationCycle) % rotationCycle;
  return workingDaysInCycle[cycleDay] === true;
}

function getCycleDay(dateStr) {
  const date = new Date(dateStr);
  const diffTime = date.getTime() - rotationStartDate.getTime();
  const diffDays = Math.floor(diffTime / (1000 * 3600 * 24));
  return ((diffDays % rotationCycle) + rotationCycle) % rotationCycle;
}

function canWorkArea(member, area) {
  if (!member) return false;
  if (area.startsWith("Panel")) return member.panel_status === 'Yes' || member.panel_status === 'Training';
  if (area.startsWith("Comp"))   return member.comp_status === 'Yes' || member.comp_status === 'Training';
  if (area.startsWith("Field"))  return member.field_status === 'Yes' || member.field_status === 'Training';
  if (area === "Demin")    return member.demin_status === 'Yes' || member.demin_status === 'Training';
  if (area === "Pretreat") return member.pt_status === 'Yes' || member.pt_status === 'Training';
  return false;
}

function formatLocalTime(dateStr) {
  return new Date(dateStr).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true
  });
}

// ====================== 4. PERMISSION ======================
async function hasScheduleEditPermission() {
  if (!currentUser) await loadUser();
  if (!currentUser) return false;
  if (currentUser.id === trevorUserId) return true;

  try {
    const { data: member } = await supabaseClient
      .from('members')
      .select('supervisor_status, lh_status')
      .eq('id', currentUser.id)
      .single();
    return member?.supervisor_status === 'Yes' || member?.lh_status === 'Yes';
  } catch (err) {
    return false;
  }
}

// ====================== 5. CHARTS ======================
async function loadMemberChartDropdown() {
    const select = document.getElementById('memberChartSelect');
    if (!select) return;

    const { data, error } = await supabaseClient
        .from('members')
        .select('full_name')
        .eq('status', 'Active')
        .order('full_name');

    if (error) return console.error(error);

    select.innerHTML = '<option value="">Select Member to View Breakdown...</option>';

    data.forEach(member => {
        const opt = document.createElement('option');
        opt.value = member.full_name;
        opt.textContent = member.full_name;
        select.appendChild(opt);
    });

    select.addEventListener('change', () => {
        const selectedMember = select.value;
        select.classList.remove('dance');
        void select.offsetWidth;
        select.classList.add('dance');

        if (selectedMember) renderMemberShiftChart(selectedMember);
        else if (memberShiftChartInstance) memberShiftChartInstance.destroy();
    });
}

function renderMemberShiftChart(memberName) {
    const canvas = document.getElementById('memberShiftChart');
    if (!canvas) return;

    const areaCounts = {
        "LH": 0, "Pretreat": 0, "Demin": 0,
        "Field": 0, "Comp": 0, "Panel": 0,
        "Floater": 0, "Supervisor": 0, "Vacation": 0
    };

    // Count shifts for this specific member
    Object.values(scheduleData).forEach(shifts => {
        shifts.forEach(shift => {
            if (shift.name === memberName) {
                let key = shift.area || "Unknown";

                if (key === "Floater") key = "Floater";
                else if (key === "Supervisor") key = "Supervisor";
                else if (key === "Vacation") key = "Vacation";
                else if (key.includes("Field")) key = "Field";
                else if (key.includes("Comp")) key = "Comp";
                else if (key.includes("Panel")) key = "Panel";

                if (areaCounts[key] !== undefined) {
                    areaCounts[key]++;
                }
            }
        });
    });

    const labels = Object.keys(areaCounts).filter(key => areaCounts[key] > 0);
    const dataValues = labels.map(key => areaCounts[key]);

    // Destroy old chart
    if (memberShiftChartInstance) {
        memberShiftChartInstance.destroy();
    }

    memberShiftChartInstance = new Chart(canvas, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: `${memberName}'s Shifts`,
                data: dataValues,
                backgroundColor: '#00C7B2',
                borderColor: '#ffffff',
                borderWidth: 1,
                borderRadius: 6,
                barThickness: 35
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: '#022f3a',
                    titleColor: '#fff',
                    bodyColor: '#a0d8ff'
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    grid: { color: 'rgba(255,255,255,0.08)' },
                    ticks: { color: '#a0d8ff' }
                },
                x: {
                    grid: { color: 'rgba(255,255,255,0.08)' },
                    ticks: { 
                        color: '#e0f0ff',
                        font: { size: 13 }
                    }
                }
            }
        }
    });
}
function renderShiftAreaChart() {
    const canvas = document.getElementById('shiftAreaChart');
    if (!canvas) return;

    const areaCounts = {
        "LH": 0,
        "Pretreat": 0,
        "Demin": 0,
        "Field": 0,
        "Comp": 0,
        "Panel": 0,
        "Floater": 0,
        "Supervisor": 0,
        "Vacation": 0
    };

    // Count shifts from current scheduleData
    Object.values(scheduleData).forEach(shifts => {
        shifts.forEach(shift => {
            let key = shift.area || "Unknown";

            if (key === "Floater") key = "Floater";
            else if (key === "Supervisor") key = "Supervisor";
            else if (key === "Vacation") key = "Vacation";
            else if (key.includes("Field")) key = "Field";
            else if (key.includes("Comp")) key = "Comp";
            else if (key.includes("Panel")) key = "Panel";

            if (areaCounts[key] !== undefined) {
                areaCounts[key]++;
            } else {
                areaCounts["Unknown"] = (areaCounts["Unknown"] || 0) + 1;
            }
        });
    });

    const labels = Object.keys(areaCounts).filter(key => areaCounts[key] > 0);
    const dataValues = labels.map(key => areaCounts[key]);

    // Destroy old chart instance to prevent stacking/growing
    if (shiftAreaChartInstance) {
        shiftAreaChartInstance.destroy();
        shiftAreaChartInstance = null;
    }

    // Update summary stats
    const totalShifts = dataValues.reduce((a, b) => a + b, 0);
    document.getElementById('totalShiftsCount').textContent = totalShifts;

    const topIndex = dataValues.indexOf(Math.max(...dataValues));
    document.getElementById('topAreaName').textContent = labels[topIndex] || '—';

    document.getElementById('floaterCount').textContent = areaCounts["Floater"] || 0;

    // Create new chart
    shiftAreaChartInstance = new Chart(canvas, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Shifts Worked',
                data: dataValues,
                backgroundColor: [
                    '#3b82f6', '#eab308', '#8b5cf6', '#ec4899',
                    '#f97316', '#14b8a6', '#f59e0b', '#22c55e', '#ef4444', '#64748b'
                ],
                borderColor: '#ffffff',
                borderWidth: 1,
                borderRadius: 8,
                barThickness: 32
            }]
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: '#022f3a',
                    titleColor: '#fff',
                    bodyColor: '#a0d8ff',
                    padding: 12
                }
            },
            scales: {
                x: {
                    grid: { color: 'rgba(255,255,255,0.08)' },
                    ticks: { color: '#a0d8ff', font: { size: 12 } }
                },
                y: {
                    grid: { color: 'rgba(255,255,255,0.08)' },
                    ticks: { 
                        color: '#e0f0ff', 
                        font: { size: 13 },
                        padding: 10
                    }
                }
            }
        }
    });
}
// ====================== 6. MEMBERS ======================
async function loadMembers() {
    const tbody = document.getElementById('membersBody');
    const listContainer = document.getElementById('membersList');

    if (!tbody && !listContainer) return;

    const { data, error } = await supabaseClient
        .from('members')
        .select('*')
        .order('full_name', { ascending: true });

    if (error) {
        console.error(error);
        if (tbody) tbody.innerHTML = `<tr><td colspan="8">Error loading members</td></tr>`;
        if (listContainer) listContainer.innerHTML = `<p>Error loading members</p>`;
        return;
    }

    if (tbody) tbody.innerHTML = '';
    if (listContainer) listContainer.innerHTML = '';

    if (!data || data.length === 0) {
        if (tbody) tbody.innerHTML = `<tr><td colspan="8">No members found yet.</td></tr>`;
        if (listContainer) listContainer.innerHTML = `<p>No members found yet.</p>`;
        return;
    }

    // ====================== DESKTOP TABLE ======================
    if (tbody) {
        data.forEach(member => {
            const certBadges = getMemberBadges(member);
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${member.full_name || 'N/A'}</td>
                <td>${member.email || 'N/A'}</td>
                <td>${member.phone || '—'}</td>
                <td>${member.role || 'Member'}</td>
                <td>${member.status || 'Active'}</td>
                <td class="certifications-cell">${certBadges}</td>
                <td>${new Date(member.joined_date || member.created_at || Date.now()).toLocaleDateString('en-US', { 
                    year: 'numeric', month: 'short', day: 'numeric' 
                })}</td>
                <td>
                    <button class="edit-btn" data-id="${member.id}">Edit</button>
                    <button class="delete-btn" data-id="${member.id}">Delete</button>
                </td>
            `;
            tbody.appendChild(row);
        });
    }

    // ====================== MOBILE CARDS ======================
    if (listContainer) {
        data.forEach(member => {
            const certBadges = getMemberBadges(member);

            const card = document.createElement('div');
            card.className = 'member-card';
            card.innerHTML = `
                <h3>${member.full_name || 'N/A'}</h3>
                <p><strong>Email:</strong> ${member.email || 'N/A'}</p>
                <p><strong>Phone:</strong> ${member.phone || '—'}</p>
                <p><strong>Role:</strong> ${member.role || 'Member'}</p>
                <p><strong>Status:</strong> ${member.status || 'Active'}</p>
                <p><strong>Joined:</strong> ${new Date(member.joined_date || member.created_at || Date.now()).toLocaleDateString('en-US', { 
                    year: 'numeric', month: 'short', day: 'numeric' 
                })}</p>
                
                <div style="margin: 12px 0 8px 0;">
                    <strong>Certifications:</strong><br>
                    ${certBadges || '<span style="color:#9ca3af; font-style:italic;">None</span>'}
                </div>

                <div style="display: flex; gap: 8px;">
                    <button class="edit-btn" data-id="${member.id}">Edit</button>
                    <button class="delete-btn" data-id="${member.id}">Delete</button>
                </div>
            `;
            listContainer.appendChild(card);
        });
    }

    // Re-attach button listeners
    setTimeout(addActionListeners, 10);
}
function openMemberModal(member = null) {
    const modal = document.getElementById('memberModal');
    const title = document.getElementById('modalTitle');

    const form = document.getElementById('memberForm');
    if (form) form.reset();

    document.getElementById('memberId').value = '';

    if (member) {
        title.textContent = 'Edit Member';
        currentEditingId = member.id;
        document.getElementById('memberId').value = member.id;

        document.getElementById('fullName').value = member.full_name || '';
        document.getElementById('email').value = member.email || '';
        document.getElementById('phone').value = member.phone || '';
        document.getElementById('role').value = member.role || 'Member';
        document.getElementById('status').value = member.status || 'Active';

        // Set dropdown values (default to "No" if null/empty)
        document.getElementById('supervisor_status').value = member.supervisor_status || 'No';
        document.getElementById('lh_status').value = member.lh_status || 'No';
        document.getElementById('pt_status').value = member.pt_status || 'No';
        document.getElementById('demin_status').value = member.demin_status || 'No';
        document.getElementById('field_status').value = member.field_status || 'No';
        document.getElementById('comp_status').value = member.comp_status || 'No';
        document.getElementById('panel_status').value = member.panel_status || 'No';

    } else {
        title.textContent = 'Add New Member';
        currentEditingId = null;

        // Reset all dropdowns to "No" when adding new member
        document.getElementById('supervisor_status').value = 'No';
        document.getElementById('lh_status').value = 'No';
        document.getElementById('pt_status').value = 'No';
        document.getElementById('demin_status').value = 'No';
        document.getElementById('field_status').value = 'No';
        document.getElementById('comp_status').value = 'No';
        document.getElementById('panel_status').value = 'No';
    }

    modal.classList.add('active');
}
async function saveMember(e) {
    if (e) e.preventDefault();

    if (!currentUser) {
        return alert("You must be logged in to manage members.");
    }

    const fullName = document.getElementById('fullName').value.trim();
    const email = document.getElementById('email').value.trim();

    if (!fullName || !email) {
        return alert("Full name and email are required.");
    }

    const memberData = {
        full_name: fullName,
        email: email,
        phone: document.getElementById('phone').value.trim() || null,
        role: document.getElementById('role').value,
        status: document.getElementById('status').value,
        updated_at: new Date().toISOString(),
        
        // New Status Dropdowns
        supervisor_status: document.getElementById('supervisor_status').value,
        lh_status: document.getElementById('lh_status').value,
        pt_status: document.getElementById('pt_status').value,
        demin_status: document.getElementById('demin_status').value,
        field_status: document.getElementById('field_status').value,
        comp_status: document.getElementById('comp_status').value,
        panel_status: document.getElementById('panel_status').value
    };

    let error;

    if (currentEditingId) {
        // UPDATE MEMBER
        ({ error } = await supabaseClient
            .from('members')
            .update(memberData)
            .eq('id', currentEditingId));

        if (!error) alert("✅ Member updated successfully!");
    } else {
        // CREATE NEW MEMBER
        memberData.id = crypto.randomUUID();

        const { data: existing } = await supabaseClient
            .from('members')
            .select('id')
            .eq('email', email)
            .maybeSingle();

        if (existing) {
            return alert(`A member with email "${email}" already exists.`);
        }

        ({ error } = await supabaseClient
            .from('members')
            .insert([memberData]));

        if (!error) alert("✅ New member added successfully!");
    }

    if (error) {
        console.error("Save error:", error);
        alert("Error saving member: " + error.message);
        return;
    }

    document.getElementById('memberModal').classList.remove('active');
    await loadMembers();
}
async function editMember(id) {
  const { data, error } = await supabaseClient.from('members').select('*').eq('id', id).single();
  if (error || !data) return alert('Error loading member data');
  openMemberModal(data);
}
async function deleteMember(id) {
  if (!confirm('Are you sure you want to delete this member?')) return;
  const { error } = await supabaseClient.from('members').delete().eq('id', id);
  if (error) alert('Error deleting member: ' + error.message);
  else loadMembers();
}
// ====================== 7. FEED ======================
function renderPost(post) {
  const container = document.getElementById('feedContainer');
  if (!container) return;

  const postEl = document.createElement('div');
  postEl.className = 'card';
  postEl.style.marginBottom = '20px';
  postEl.style.transition = "all 0.4s ease";
  const postId = post.id;
  postEl.dataset.postId = postId;

  // === CLEAN LOCAL TIME FOR POST HEADER ===
  const createdTime = new Date(post.created_at).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
  });

  let html = `
      <div class="post-header">
        <strong>${post.full_name || 'Crew Member'}</strong> • ${createdTime}
      </div>
  `;

  if (post.post_type !== 'poll' && post.content) {
    html += `<div class="post-content">${post.content}</div>`;
  }

  // Image handling
  let imageArray = [];
  if (post.image_urls) {
    if (Array.isArray(post.image_urls)) imageArray = post.image_urls;
    else if (typeof post.image_urls === 'string') {
      try { imageArray = JSON.parse(post.image_urls); } 
      catch (e) { imageArray = [post.image_urls]; }
    }
  }
  if (imageArray.length > 0) {
    html += `<div class="post-images">`;
    imageArray.forEach(url => {
      if (url) {
        const cacheBusterUrl = url + (url.includes('?') ? '&' : '?') + 't=' + Date.now();
        html += `<img src="${cacheBusterUrl}" alt="post image" loading="lazy" onerror="this.style.display='none'" style="max-width:100%; border-radius:12px; margin:10px 0; display:block;">`;
      }
    });
    html += `</div>`;
  }

  // Poll
  if (post.post_type === 'poll' && Array.isArray(post.poll_options)) {
    const totalVotes = Object.values(post.poll_votes || {}).reduce((a, b) => a + b, 0);
    const hasVoted = post.user_votes && post.user_votes[currentUser?.id];
    html += `<div class="poll"><strong>${post.content || 'Poll Question'}</strong><div class="poll-total">Total votes: ${totalVotes}</div>`;
    post.poll_options.forEach(option => {
      const votes = (post.poll_votes && post.poll_votes[option]) || 0;
      const percentage = totalVotes > 0 ? Math.round((votes / totalVotes) * 100) : 0;
      const isSelected = hasVoted === option;
      html += `
        <div class="poll-option ${isSelected ? 'voted' : ''}" onclick="${!hasVoted ? `voteOnPoll('${post.id}', '${option}')` : ''}">
          <div class="poll-option-header">
            <span class="poll-text">${option}</span>
            ${isSelected ? `<span class="your-vote">✓ Your vote</span>` : ''}
          </div>
          <div class="progress-container"><div class="progress-bar" style="width: ${percentage}%"></div></div>
          <div class="poll-stats"><span class="poll-percentage">${percentage}%</span><span class="poll-votes">${votes} votes</span></div>
        </div>`;
    });
    html += `</div>`;
  }

// Event - Local Browser Time
if (post.post_type === 'event' && post.event_title && post.event_date) {
      const eventTime = new Date(post.event_date).toLocaleString('en-US', {
          weekday: 'short',
          month: 'short',
          day: 'numeric',
          year: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
          hour12: true
      });

      html += `
        <div class="event">
          <strong>📅 ${post.event_title}</strong><br>
          When: ${eventTime}<br>
          ${post.event_location ? `Where: ${post.event_location}<br>` : ''}
          ${post.event_description || ''}
        </div>`;
  }

  // Actions + Comment Input (Clean)

      

// === UPDATED LIKE SECTION ===
const likeCount = post.likes || 0;
const showLikersLink = likeCount > 0;

html += `
    <div class="post-actions">
      <div style="display: flex; gap: 12px; align-items: center; margin-bottom: 8px;">
        <button onclick="toggleLike('${postId}')" id="like-btn-${postId}" class="action-btn like-btn">
          ❤️ <span id="like-count-${postId}">${post.likes || 0}</span>
        </button>
        
        <button class="action-btn comment-btn" onclick="toggleCommentBox('${postId}')">💬 Comment</button>
      </div>
      
      <!-- Liked by moved underneath -->
      ${post.likes > 0 ? `
        <button onclick="showLikers('${postId}')" id="likers-link-${postId}" class="likers-link">
          Liked by ${post.likes} ${post.likes === 1 ? 'person' : 'people'}
        </button>
      ` : ''}
    </div>
`;      
      


  html += `
    

        <!-- Comment Input Box - Lighter -->
    <div id="comment-box-${postId}" class="comment-input-box" style="display: none;">
      <textarea id="comment-input-${postId}" placeholder="Write a comment..."></textarea>
      <div style="margin-top: 12px; text-align: right;">
        <button onclick="addComment('${postId}')">Post Comment</button>
      </div>
    </div>

    <!-- Comments Display Area -->
    <div id="comments-${postId}" class="comments-container"></div>
  `;

  postEl.innerHTML = html;

  postEl.innerHTML = html;

// Add Delete "X" button in top-right corner
const deleteX = document.createElement('button');
deleteX.className = 'post-delete-x';
deleteX.innerHTML = '✕';
deleteX.title = 'Delete post';
deleteX.onclick = (e) => {
    e.stopPropagation();           // Prevent any parent clicks
    deletePost(postId);
};

postEl.style.position = 'relative';   // Important for absolute positioning
postEl.appendChild(deleteX);

loadCommentsForPost(postId);
  container.prepend(postEl);

  loadCommentsForPost(postId);
}

async function loadFeed(sortBy = 'latest') {
  currentSort = sortBy;
  const container = document.getElementById('feedContainer');
  if (!container) return;

  container.innerHTML = '<p>Loading feed...</p>';

  let query = supabaseClient.from('posts').select('*');

  if (sortBy === 'latest') query = query.order('created_at', { ascending: true });
  else if (sortBy === 'oldest') query = query.order('created_at', { ascending: false });
  else if (sortBy === 'popular') query = query.order('likes', { ascending: true });

  const { data, error } = await query;

  container.innerHTML = '';

  if (error) {
    console.error(error);
    container.innerHTML = `<p>Error loading feed</p>`;
    return;
  }

  if (!data || data.length === 0) {
    container.innerHTML = `<p>No posts yet. Be the first!</p>`;
    return;
  }

  // Render all posts
  data.forEach(renderPost);

  // Re-load comments for ALL visible posts after rendering
  setTimeout(() => {
    document.querySelectorAll('.card').forEach(card => {
      const postId = card.dataset.postId;
      if (postId) {
        loadCommentsForPost(postId);
      }
    });
  }, 100);
}
async function toggleLike(postId) {
    if (!currentUser) {
        return alert("You must be logged in to like posts.");
    }

    try {
        // Check if user already liked this post
        const { data: existingLike, error: checkError } = await supabaseClient
            .from('post_likes')
            .select('id')
            .eq('post_id', postId)
            .eq('user_id', currentUser.id)
            .maybeSingle();

        if (checkError) throw checkError;

        if (existingLike) {
            // === UNLIKE ===
            const { error: deleteError } = await supabaseClient
                .from('post_likes')
                .delete()
                .eq('post_id', postId)
                .eq('user_id', currentUser.id);

            if (deleteError) throw deleteError;

            localStorage.removeItem(`liked_${postId}`);
            alert("❤️ Like removed");
        } else {
            // === LIKE ===
            const { error: insertError } = await supabaseClient
                .from('post_likes')
                .insert({
                    post_id: postId,
                    user_id: currentUser.id
                });

            if (insertError) throw insertError;

            localStorage.setItem(`liked_${postId}`, 'true');
            alert("❤️ Liked!");
        }

        // Refresh the post to update count and heart appearance
        await refreshSinglePost(postId);

    } catch (err) {
        console.error("Like/Unlike error:", err);
        alert("Failed to update like. Please try again.");
    }
}
async function addComment(postId) {
  const input = document.getElementById(`comment-input-${postId}`);
  const content = input ? input.value.trim() : '';

  if (!content) {
    return alert("Please enter a comment.");
  }

  // Better check for currentUser
  if (!currentUser) {
    console.error("currentUser is null");
    return alert("You must be logged in to comment. Please refresh the page.");
  }

  console.log("Current user for comment:", currentUser.id); // Debug line

  try {
    // Get full name
    const { data: member, error: memberError } = await supabaseClient
      .from('members')
      .select('full_name')
      .eq('id', currentUser.id)
      .single();

    const displayName = member?.full_name && member.full_name.trim() !== ''
      ? member.full_name.trim()
      : (currentUser.email ? currentUser.email.split('@')[0] : 'Crew Member');

    const { error } = await supabaseClient.from('comments').insert({
      post_id: postId,
      user_id: currentUser.id,
      full_name: displayName,
      content: content
    });

    if (error) {
      console.error("Comment insert error:", error);
      alert("Failed to post comment: " + error.message);
    } else {
      input.value = '';
      loadCommentsForPost(postId);
      alert("✅ Comment posted!");
    }
  } catch (err) {
    console.error("Error posting comment:", err);
    alert("An error occurred while posting comment.");
  }
}
async function showLikers(postId) {
    if (!currentUser) return alert("Not logged in.");

    try {
        const { data: likesData } = await supabaseClient
            .from('post_likes')
            .select('user_id')
            .eq('post_id', postId);

        const userIds = likesData.map(l => l.user_id);

        const { data: members } = await supabaseClient
            .from('members')
            .select('id, full_name, email')
            .in('id', userIds);

        console.log("🔍 DEBUG - Likes:", likesData);
        console.log("🔍 DEBUG - Members found:", members);

        const memberMap = {};
        members.forEach(m => {
            memberMap[m.id] = m.full_name?.trim() || m.email?.split('@')[0] || "Unknown";
        });

        const names = likesData.map(like => 
            memberMap[like.user_id] || "Unknown Member"
        );

        alert(`Liked by ${names.length} people:\n\n• ${names.join("\n• ")}`);

    } catch (e) {
        console.error(e);
        alert("Error: " + e.message);
    }
}
async function loadCommentsForPost(postId) {
const container = document.getElementById(`comments-${postId}`);
if (!container) {
console.warn(`Comments container for post ${postId} not found`);
return;
  }

const { data, error } = await supabaseClient
    .from('comments')
    .select('*')
    .eq('post_id', postId)
    .order('created_at', { ascending: true });

if (error) {
console.error("Error loading comments:", error);
container.innerHTML = `<p style="color:#ef4444;">Error loading comments</p>`;
return;
  }

if (!data || data.length === 0) {
container.innerHTML = `<p style="color:#9ca3af; font-style:italic;">No comments yet. Be the first!</p>`;
return;
  }

container.innerHTML = '';
data.forEach(comment => {
const div = document.createElement('div');
div.className = 'comment';
div.style.position = 'relative';           // Important for absolute X button
div.style.marginBottom = '12px';
div.style.padding = '12px 40px 12px 12px'; // Space for the X button
div.style.borderRadius = '12px';
div.style.background = 'rgba(255,255,255,0.06)';

div.innerHTML = `
      <strong>${comment.full_name || 'Crew Member'}</strong>
      <small style="margin-left: 10px; color: #9ca3af;">${new Date(comment.created_at).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</small>
      <div style="margin-top: 6px; color:#e0f0ff;">${comment.content}</div>
    `;

    // Add Delete "X" for comments (only if it's the user's own comment or admin)
    if (currentUser && (comment.user_id === currentUser.id)) {   // You can expand this for admins later
        const deleteX = document.createElement('button');
        deleteX.className = 'comment-delete-x';
        deleteX.innerHTML = '✕';
        deleteX.title = 'Delete comment';
        deleteX.onclick = (e) => {
            e.stopPropagation();
            deleteComment(comment.id, postId);
        };
        div.appendChild(deleteX);
    }

    container.appendChild(div);
  });
}
// Poll & Event Modals
function showPollModal() {
  pollOptions = ["", ""];
  const modal = document.getElementById('pollModal');
  if (modal) modal.style.display = 'flex';
  
  document.getElementById('pollQuestion').value = '';
  renderPollOptions();
  document.getElementById('pollQuestion').focus();
}
function hidePollModal() { /* your original */ }
function showEventModal() { /* your original */ }
function hideEventModal() { /* your original */ }
async function createPoll() { /* your original */ }
async function createEvent() { /* your original */ }

// ====================== 8. CALENDAR & SCHEDULE ======================
async function loadSchedule() { /* your original */ }
async function renderCalendar() { /* your original */ }
function showDayDetails(dateStr) { /* your original with clean time */ }
async function autoPopulateCurrentMonth() { /* your original */ }
async function clearCurrentMonth() { /* your original */ }

// Drag selection (latest version)
function startDrag(e, dayEl) { /* your latest improved version */ }
function onDragMove(e) { /* your latest */ }
function endDrag() { /* your latest */ }
function clearSelection() { /* your latest */ }

// ====================== 9. OVERTIME ======================
async function loadOTLeaderboard() { /* your original */ }
async function loadOpenOTShifts() { /* your original */ }
async function placeBid(shiftId) { /* your original */ }
async function awardOTShift(shiftId) { /* your original */ }
async function editOTShift(shiftId) { /* your original */ }
async function saveOTEdit() { /* your original */ }
async function deleteOTShift(shiftId) { /* your original */ }

// ====================== 10. GOLF ======================
async function loadGolfLeaderboard() { /* your original */ }
// other golf functions...

// ====================== 11. EVENTS PAGE ======================
async function loadEventsPage() { /* your original */ }
function renderEvents(eventsList, tab) { /* your original */ }
function initEventsTabs() { /* your original */ }

// ====================== 12. UI HELPERS ======================
function initMobileMenu() { /* your original */ }
function initTabs() { /* your original */ }
function resetAllModalsAndSelections() { /* your original */ }

// ====================== 13. MAIN INITIALIZATION ======================
document.addEventListener('DOMContentLoaded', async () => {
    // Navbar
    fetch('navbar.html').then(r => r.text()).then(data => {
        const ph = document.getElementById('navbar-placeholder');
        if (ph) ph.innerHTML = data;
        setTimeout(initMobileMenu, 100);
    });

    await loadUser();

    // Page routing
    if (document.getElementById('calendarGrid')) {
        resetAllModalsAndSelections();
        await loadSchedule();
        await renderCalendar();
        loadMembersIntoDropdown();
        setupDayDetailsCloseButton();
    }

    if (document.getElementById('feedContainer')) {
        setupImagePreview();
        await loadFeed('latest');
        subscribeToFeed();
    }

    if (document.getElementById('eventsContainer')) {
        loadEventsPage();
        initEventsTabs();
    }

    if (document.getElementById('otLeaderboard')) {
        loadOTLeaderboard();
        loadOpenOTShifts();
    }

    if (document.getElementById('leaderboardBody')) {
        loadGolfLeaderboard();
    }

    if (document.getElementById('membersBody') || document.getElementById('membersList')) {
        loadMembers();
    }

    initTabs();
    loadMemberChartDropdown();
});

// ====================== 14. GLOBAL EXPOSURES ======================
window.showPostOTModal = showPostOTModal;
window.hidePostOTModal = hidePostOTModal;
window.postOTShift = postOTShift;
window.placeBid = placeBid;
window.awardOTShift = awardOTShift;
window.editOTShift = editOTShift;
window.deleteOTShift = deleteOTShift;
window.showOTMemberDetails = showOTMemberDetails;
window.hideOTDetailModal = hideOTDetailModal;
window.hideOTEditModal = hideOTEditModal;
window.saveOTEdit = saveOTEdit;
window.showPollModal = showPollModal;
window.hidePollModal = hidePollModal;
window.showEventModal = showEventModal;
window.hideEventModal = hideEventModal;
window.createPoll = createPoll;
window.createEvent = createEvent;
window.deletePost = deletePost;
window.deleteComment = deleteComment;