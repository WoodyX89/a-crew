// ================================================
// app.js - Complete Updated Version
// ================================================

const supabaseClient = supabase.createClient(
  'https://bwfwnpdjeovqeznwbckx.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ3ZnducGRqZW92cWV6bndiY2t4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYxOTI2NzIsImV4cCI6MjA5MTc2ODY3Mn0.QohjsfSgvw64ZwSLRCtr_4rh49JyInEmrpDdzrXISQU'
);

// ====================== FINAL 28-DAY ROTATION (Your Desired Pattern) ======================
const rotationCycle = 28;
const workingDaysInCycle = [
    false, false,                    // OFF
    true,  true,                     // Days - 2 days (same members)
    true,  true,  true,              // Nights - 3 nights (same members)
    false, false, false, false, false, // OFF
    true,  true,                     // Days - 2 days (same members)
    true,  true,                     // Nights - 2 nights (same members)
    false, false, false, false, false, // OFF
    true,  true,  true,              // Days - 3 days (same members)
    true,  true, false, false        // Nights - 2 nights (same members)
];
const rotationStartDate = new Date('2025-01-01');

function isWorkingDay(dateStr) {
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return false;
  const diffTime = date.getTime() - rotationStartDate.getTime();
  const diffDays = Math.floor(diffTime / (1000 * 3600 * 24));
  const cycleDay = ((diffDays % rotationCycle) + rotationCycle) % rotationCycle;
  return workingDaysInCycle[cycleDay] === true;
}

// ====================== GLOBAL VARIABLES ======================
let currentEditingId = null;
let currentUser = null;
let selectedFiles = [];
let pollOptions = ["", ""];
let feedChannel = null;
let currentSort = 'latest';
let scheduleData = {};
let currentDate = new Date();
let eventsThisMonth = {};   // Will store events by dateStr
let isDragging = false;
let selectedDays = [];
let dragStartElement = null;
let multiSelectActive = false;
let memberShiftChartInstance = null;

// ====================== STRONG RESET FUNCTION ======================
function resetAllModalsAndSelections() {
    selectedDays = [];
    multiSelectActive = false;
    isDragging = false;

    // Clear visual selection
    document.querySelectorAll('.calendar-day').forEach(el => {
        el.classList.remove('selected-range');
    });

    // Close day details panel
    const dayDetails = document.getElementById('dayDetails');
    if (dayDetails) dayDetails.classList.remove('open');

    // Close bulk modal
    const bulkModal = document.getElementById('bulkShiftModal');
    if (bulkModal) bulkModal.classList.remove('active');
}
// ====================== MOUNTAIN TIME HELPER ======================
function getMTDateTime() {
    return new Date().toLocaleString('en-CA', { 
        timeZone: 'America/Edmonton',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
    }).replace(',', '');
}

// Force consistent Mountain Time handling
function getMountainDateStr(dateStr) {
    if (!dateStr) return null;
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-CA', { timeZone: 'America/Edmonton' }); // YYYY-MM-DD in MT
}

// ====================== MEMBER-SPECIFIC VERTICAL SHIFT CHART (with dancing dropdown) ======================


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

    // Add change listener with dance animation
    select.addEventListener('change', () => {
        const selectedMember = select.value;
        
        // Trigger the dance animation
        select.classList.remove('dance');
        void select.offsetWidth; // Force reflow
        select.classList.add('dance');

        if (selectedMember) {
            renderMemberShiftChart(selectedMember);
        } else {
            if (memberShiftChartInstance) memberShiftChartInstance.destroy();
        }
    });
}

// ====================== ENHANCED CREW OVERVIEW (Percentages by Month + Year + Plant) ======================
async function renderMemberShiftBreakdown() {
    const container = document.getElementById('memberBreakdownContainer');
    if (!container) return;

    container.innerHTML = '<p style="grid-column: 1/-1; text-align: center; color: #9ca3af;">Loading detailed statistics...</p>';

    const { data: members, error } = await supabaseClient
        .from('members')
        .select('full_name')
        .eq('status', 'Active')
        .order('full_name');

    if (error || !members) {
        container.innerHTML = '<p style="color:#ef4444;">Error loading members</p>';
        return;
    }

    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();

    const monthStart = `${year}-${String(month+1).padStart(2,'0')}-01`;
    const monthEnd = `${year}-${String(month+1).padStart(2,'0')}-${new Date(year, month+1, 0).getDate()}`;
    const yearStart = `${year}-01-01`;

    container.innerHTML = '';

    members.forEach(member => {
        const memberName = member.full_name;
        let monthShifts = [];
        let yearShifts = [];

        Object.keys(scheduleData).forEach(dateStr => {
            const shifts = scheduleData[dateStr] || [];
            const memberShifts = shifts.filter(s => s.name === memberName);

            if (dateStr >= monthStart && dateStr <= monthEnd) {
                monthShifts = monthShifts.concat(memberShifts);
            }
            if (dateStr >= yearStart) {
                yearShifts = yearShifts.concat(memberShifts);
            }
        });

        const monthStats = calculateAreaStats(monthShifts);
        const yearStats = calculateAreaStats(yearShifts);

        const card = document.createElement('div');
        card.style.cssText = `
            background: rgba(255,255,255,0.06);
            border-radius: 16px;
            padding: 20px;
            border: 1px solid rgba(0,199,178,0.2);
        `;

        let html = `
            <h4 style="margin: 0 0 16px 0; color: #00C7B2;">${memberName}</h4>
            
            <div style="display: flex; justify-content: space-between; margin-bottom: 16px; gap: 12px;">
                <div style="text-align:center;">
                    <span style="color:#a0d8ff; font-size:0.9rem;">THIS MONTH</span><br>
                    <strong style="font-size:1.8rem; color:white;">${monthStats.totalWorked}</strong>
                </div>
                <div style="text-align:center;">
                    <span style="color:#a0d8ff; font-size:0.9rem;">YEAR TO DATE</span><br>
                    <strong style="font-size:1.8rem; color:white;">${yearStats.totalWorked}</strong>
                </div>
                <div style="text-align:center;">
                    <span style="color:#ef4444; font-size:0.9rem;">VACATION</span><br>
                    <strong style="font-size:1.6rem; color:#ef4444;">${yearStats.vacationDays}</strong>
                </div>
            </div>
        `;

        // This Month Area Percentages
        html += `<div style="margin-bottom:18px;">
            <strong style="color:#a0d8ff; font-size:0.95rem;">THIS MONTH AREAS</strong>
            <div style="display:flex; flex-wrap:wrap; gap:6px; margin-top:8px;">`;
        Object.keys(monthStats.percentages).forEach(area => {
            if (monthStats.percentages[area] > 0) {
                html += `<span style="background:rgba(0,199,178,0.15); color:#e0f0ff; padding:4px 10px; border-radius:9999px; font-size:0.85rem;">
                    ${area}: <strong>${monthStats.percentages[area]}%</strong>
                </span>`;
            }
        });
        html += `</div></div>`;

        // Year to Date Area Percentages
        html += `<div>
            <strong style="color:#a0d8ff; font-size:0.95rem;">YEAR TO DATE AREAS</strong>
            <div style="display:flex; flex-wrap:wrap; gap:6px; margin-top:8px;">`;
        Object.keys(yearStats.percentages).forEach(area => {
            if (yearStats.percentages[area] > 0) {
                html += `<span style="background:rgba(0,199,178,0.15); color:#e0f0ff; padding:4px 10px; border-radius:9999px; font-size:0.85rem;">
                    ${area}: <strong>${yearStats.percentages[area]}%</strong>
                </span>`;
            }
        });
        html += `</div></div>`;

        card.innerHTML = html;
        container.appendChild(card);
    });

    if (members.length === 0) {
        container.innerHTML = '<p style="color:#9ca3af; text-align:center;">No active members found.</p>';
    }
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


// ====================== PERMISSION CHECK - TREVOR WOOD (Full Access) ======================
async function hasScheduleEditPermission() {
    if (!currentUser) {
        await loadUser();   // Make sure user is loaded
    }
    if (!currentUser) return false;

    // ✅ YOUR USER ID - Full Access
    const trevorUserId = "2f461757-567a-4ec7-8c9d-fa97138265e5";

    if (currentUser.id === trevorUserId) {
        return true;
    }

    // Normal permission for other Supervisors / LH members
    try {
        const { data: member } = await supabaseClient
            .from('members')
            .select('supervisor_status, lh_status')
            .eq('id', currentUser.id)
            .single();

        return member?.supervisor_status === 'Yes' || 
               member?.lh_status === 'Yes';
    } catch (err) {
        console.error("Permission check failed:", err);
        return false;
    }
}
// Load events for the current month
async function loadEventsForMonth(year, month) {
    eventsThisMonth = {};

    const startDate = `${year}-${String(month+1).padStart(2,'0')}-01`;
    const endDate = `${year}-${String(month+1).padStart(2,'0')}-${new Date(year, month+1, 0).getDate()}`;

    const { data, error } = await supabaseClient
        .from('posts')
        .select('event_date, event_title')
        .eq('post_type', 'event')
        .gte('event_date', startDate)
        .lte('event_date', endDate + 'T23:59:59');

    if (error) {
        console.error("Error loading events:", error);
        return;
    }

    data.forEach(event => {
        if (event.event_date) {
            const dateStr = event.event_date.split('T')[0]; // Get YYYY-MM-DD
            if (!eventsThisMonth[dateStr]) eventsThisMonth[dateStr] = [];
            eventsThisMonth[dateStr].push(event);
        }
    });
}
// ====================== DELETE POST FUNCTION (Minimal Test Version) ======================
async function deletePost(postId) {
  if (!currentUser) {
    return alert("You must be logged in.");
  }

  if (!confirm("Delete this post permanently?")) {
    return;
  }

  try {
    const { error } = await supabaseClient
      .from('posts')
      .delete()
      .eq('id', postId);

    if (error) {
      console.error("Delete error:", error);
      alert("Delete failed: " + error.message);
      return;
    }

    // Immediate DOM removal - no refresh
    const element = document.querySelector(`[data-post-id="${postId}"]`);
    if (element) {
      element.style.opacity = "0";
      setTimeout(() => element.remove(), 400);
    }

    alert("✅ Post deleted.");

    // Do NOT call loadFeed() here
    console.log("Post removed from DOM. No full refresh called.");

  } catch (err) {
    console.error(err);
    alert("Error deleting post.");
  }
}

window.deletePost = deletePost;

// ====================== DELETE COMMENT FUNCTION ======================
async function deleteComment(commentId, postId) {
    if (!currentUser) {
        return alert("You must be logged in.");
    }

    if (!confirm("Delete this comment permanently?")) {
        return;
    }

    try {
        const { error } = await supabaseClient
            .from('comments')
            .delete()
            .eq('id', commentId);

        if (error) {
            console.error("Delete comment error:", error);
            alert("Failed to delete comment: " + error.message);
            return;
        }

        // Refresh only this post's comments (no full page reload)
        loadCommentsForPost(postId);
        alert("✅ Comment deleted.");

    } catch (err) {
        console.error(err);
        alert("Error deleting comment.");
    }
}

// Expose to global scope so onclick handlers can call it
window.deleteComment = deleteComment;

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

function subscribeToFeed() {
    if (feedChannel) return; // prevent duplicate subscriptions

    feedChannel = supabaseClient.channel('crew-feed')
        // New posts (existing)
        .on('postgres_changes', {
            event: 'INSERT',
            schema: 'public',
            table: 'posts'
        }, (payload) => {
            console.log('New post inserted:', payload);
            renderPost(payload.new);
        })

        // Likes / Unlikes → when posts.likes changes
        .on('postgres_changes', {
            event: 'UPDATE',
            schema: 'public',
            table: 'posts',
            filter: 'likes=gt.0'   // optional: only if likes > 0
        }, (payload) => {
            console.log('Post updated (likes changed):', payload);
            refreshSinglePost(payload.new.id);   // We'll define this below
        })

        // Optional: Listen directly to post_likes for more reliability
        .on('postgres_changes', {
            event: '*',                    // INSERT, UPDATE, DELETE
            schema: 'public',
            table: 'post_likes'
        }, (payload) => {
            console.log('post_likes changed:', payload);
            if (payload.eventType === 'INSERT' || payload.eventType === 'DELETE') {
                refreshSinglePost(payload.new?.post_id || payload.old?.post_id);
            }
        })

        .subscribe((status) => {
            console.log('Realtime subscription status:', status);
        });
}

// ====================== FANCY SHIFT CHART BY AREA (Fixed - No Growth) ======================
let shiftAreaChartInstance = null;

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

// ====================== MOBILE MENU ======================
function initMobileMenu() {
  const hamburger = document.getElementById('hamburger');
  const mobileMenu = document.getElementById('mobileMenu');
  const closeMenu = document.getElementById('closeMenu');
  const mobileSettingsToggle = document.getElementById('mobileSettingsToggle');
  const mobileSettingsMenu = document.getElementById('mobileSettingsMenu');

  if (!hamburger || !mobileMenu || !closeMenu) return;

  // Open mobile menu
  hamburger.addEventListener('click', () => {
    mobileMenu.classList.add('active');
    document.body.style.overflow = 'hidden';   // Prevent scrolling behind menu
  });

  // Close mobile menu
  closeMenu.addEventListener('click', () => {
    mobileMenu.classList.remove('active');
    document.body.style.overflow = 'visible';
  });

  // Mobile Settings Dropdown Toggle
  if (mobileSettingsToggle && mobileSettingsMenu) {
    mobileSettingsToggle.addEventListener('click', (e) => {
      e.stopPropagation(); // Prevent closing menu when clicking toggle

      const isOpen = mobileSettingsMenu.style.display === 'flex';

      // Close menu first
      mobileSettingsMenu.style.display = isOpen ? 'none' : 'flex';
      mobileSettingsToggle.classList.toggle('active', !isOpen);
    });
  }

  // Close mobile menu when clicking any main link (except settings toggle)
  document.querySelectorAll('.mobile-link').forEach(link => {
    link.addEventListener('click', () => {
      // Only close if it's not inside the dropdown
      if (!link.closest('.mobile-dropdown-menu')) {
        mobileMenu.classList.remove('active');
        document.body.style.overflow = 'visible';
      }
    });
  });

  // Close menu when pressing Escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && mobileMenu.classList.contains('active')) {
      mobileMenu.classList.remove('active');
      document.body.style.overflow = 'visible';
    }
  });
}

// Initialize when page loads
document.addEventListener('DOMContentLoaded', () => {
  initMobileMenu();
});


// ====================== MEMBERS FUNCTIONS - UPDATED WITH CERTIFICATIONS ======================
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
// Get unique key for each block (so same workers stay together)
function getBlockKey(dateStr) {
    const cycleDay = getCycleDay(dateStr);
    if (cycleDay >= 2 && cycleDay <= 6) return "block1";
    if (cycleDay >= 12 && cycleDay <= 15) return "block2";
    if (cycleDay >= 21 && cycleDay <= 25) return "block3";
    return "unknown";
}

// Assign stable areas for a block
function assignStableAreas(regularWorkers, alreadyUsed) {
    const available = regularWorkers.filter(m => !alreadyUsed.has(m.full_name));
    const requiredAreas = ["Panel 1", "Panel 2", "Comp 1", "Comp 2", "Field 1", "Field 2", "Demin", "Pretreat", "LH"];
    
    const assignment = [];
    let areaIndex = 0;

    // Shuffle slightly but keep stable within block
    const shuffled = [...available].sort(() => Math.random() - 0.5);

    shuffled.forEach(member => {
        let assigned = false;

        // Try to give them a certified area
        for (let i = 0; i < requiredAreas.length; i++) {
            const area = requiredAreas[(areaIndex + i) % requiredAreas.length];
            if (canWorkArea(member, area)) {
                assignment.push({ member_name: member.full_name, area: area });
                areaIndex++;
                assigned = true;
                break;
            }
        }

        if (!assigned) {
            assignment.push({ member_name: member.full_name, area: "Floater" });
        }
    });

    return assignment;
}
function createShift(dateStr, memberName, area, status = 'working') {
    return {
        date: dateStr,
        member_name: memberName,
        area: area,
        status: status,
        is_floater: area === "Floater"
    };
}

function getBlockKey(cycleDay) {
    if (cycleDay >= 2 && cycleDay <= 6) return "B1";   // 2D + 3N
    if (cycleDay >= 12 && cycleDay <= 15) return "B2"; // 2D + 2N
    if (cycleDay >= 21 && cycleDay <= 25) return "B3"; // 3D + 2N
    return "Other";
}

function createStableBlockAssignment(regularWorkers, alreadyUsed) {
    const available = regularWorkers.filter(m => !alreadyUsed.has(m.full_name));
    const requiredAreas = [
        "LH", "Pretreat", "Demin",
        "Field 1", "Field 2", "Comp 1", "Comp 2",
        "Panel 1", "Panel 2"
    ];

    const assignment = [];
    let areaIdx = 0;

    // Shuffle once per block for fair rotation
    const shuffledWorkers = [...available].sort(() => Math.random() - 0.5);

    shuffledWorkers.forEach(worker => {
        let assignedArea = "Floater";

        // Try to assign a certified area
        for (let i = 0; i < requiredAreas.length; i++) {
            const area = requiredAreas[(areaIdx + i) % requiredAreas.length];
            if (canWorkArea(worker, area)) {
                assignedArea = area;
                areaIdx = (areaIdx + 1) % requiredAreas.length;
                break;
            }
        }

        assignment.push({
            member_name: worker.full_name,
            area: assignedArea
        });
    });

    return assignment;
}
// ====================== CALENDAR DAY FLAGS (Final Rules) ======================
function getDayFlags(dateStr) {
    const shifts = scheduleData[dateStr] || [];
    if (shifts.length === 0) {
        return {
            hasFlag: true,
            reasons: ["No shifts scheduled for this working day"]
        };
    }

    // Separate working shifts (vacations don't count)
    const workingShifts = shifts.filter(s => s.status !== 'vacation');
    const totalWorking = workingShifts.length;

    const coveredAreas = new Set(workingShifts.map(s => s.area));
    const reasons = [];

    // Critical roles logic
    const hasLH = coveredAreas.has("LH");
    const hasSupervisor = coveredAreas.has("Supervisor");

    // Supervisor is only critical if LH is NOT available
    if (!hasSupervisor && !hasLH) {
        reasons.push("Missing Supervisor (and no LH backup)");
    }

    // Other critical roles
    const otherCritical = ["Panel 1", "Panel 2", "Comp 1", "Comp 2", "Field 1", "Field 2", "Demin", "Pretreat"];
    const missingOther = otherCritical.filter(area => !coveredAreas.has(area));

    if (missingOther.length > 0) {
        reasons.push(`Missing critical roles: ${missingOther.join(", ")}`);
    }

    // Low staffing
    if (totalWorking < 9) {
        reasons.push(`Below minimum crew: ${totalWorking}/9 working shifts`);
    }

    return {
        hasFlag: reasons.length > 0,
        reasons: reasons,
        totalWorking: totalWorking
    };
}

// ====================== AREA STATS HELPER (Month + Year + Plant Separation) ======================
function calculateAreaStats(shiftsForMember) {
    const areaCounts = {
        "Supervisor": 0, "LH": 0, "Pretreat": 0, "Demin": 0,
        "Field 1": 0, "Field 2": 0,
        "Comp 1": 0, "Comp 2": 0,
        "Panel 1": 0, "Panel 2": 0,
        "Floater": 0,
        "Vacation": 0
    };

    shiftsForMember.forEach(shift => {
        let key = shift.area || "Unknown";
        if (areaCounts[key] !== undefined) {
            areaCounts[key]++;
        }
    });

    const totalWorked = Object.keys(areaCounts).reduce((sum, key) => {
        return (key !== "Vacation") ? sum + areaCounts[key] : sum;
    }, 0);

    const percentages = {};
    Object.keys(areaCounts).forEach(key => {
        if (key !== "Vacation") {
            percentages[key] = totalWorked > 0 ? Math.round((areaCounts[key] / totalWorked) * 100) : 0;
        }
    });

    return {
        areaCounts,
        percentages,
        totalWorked,
        vacationDays: areaCounts["Vacation"] || 0
    };
}
// Helper function to generate certification badges
function getCertificationBadges(member) {
    if (!member) return '';

    const badges = [];

    if (member.is_supervisor) badges.push('<span class="cert-badge supervisor">Supervisor</span>');
    if (member.certified_lh) badges.push('<span class="cert-badge lh">LH</span>');
    if (member.certified_pt) badges.push('<span class="cert-badge pt">PT</span>');
    if (member.certified_demin) badges.push('<span class="cert-badge demin">Demin</span>');
    if (member.certified_field) badges.push('<span class="cert-badge field">Field</span>');
    if (member.certified_comp) badges.push('<span class="cert-badge comp">Comp</span>');
    if (member.certified_panel) badges.push('<span class="cert-badge panel">Panel</span>');

    return badges.join('');
}

function addActionListeners() {
  document.querySelectorAll('.edit-btn').forEach(btn => {
    btn.removeEventListener('click', handleEditClick);
    btn.addEventListener('click', handleEditClick);
  });

  document.querySelectorAll('.delete-btn').forEach(btn => {
    btn.removeEventListener('click', handleDeleteClick);
    btn.addEventListener('click', handleDeleteClick);
  });
}

function handleEditClick(e) {
  const id = e.currentTarget.dataset.id;
  if (id) editMember(id);
}

function handleDeleteClick(e) {
  const id = e.currentTarget.dataset.id;
  if (id) deleteMember(id);
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

function changeSort() {
  const sortBy = document.getElementById('sortSelect').value;
  loadFeed(sortBy);
}

// ====================== SHOW WHO LIKED THE POST (Fixed Version) ======================
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

window.showLikers = showLikers;

// Refresh only one post's like count
async function refreshSinglePost(postId) {
    if (!postId) return;

    try {
        const { data: post, error } = await supabaseClient
            .from('posts')
            .select('likes')
            .eq('id', postId)
            .single();

        if (error) throw error;

        const count = post.likes || 0;

        // Update the heart count
        const countEl = document.getElementById(`like-count-${postId}`);
        if (countEl) countEl.textContent = count;

        // Update or create the "Liked by" link
        let likersLink = document.getElementById(`likers-link-${postId}`);

        if (count > 0) {
            if (likersLink) {
                // Update existing link
                likersLink.textContent = `Liked by ${count} ${count === 1 ? 'person' : 'people'}`;
            } else {
                // Create new link if it didn't exist before
                const actionsDiv = document.querySelector(`[data-post-id="${postId}"] .post-actions`);
                if (actionsDiv) {
                    const newLink = document.createElement('button');
                    newLink.id = `likers-link-${postId}`;
                    newLink.className = 'likers-link';
                    newLink.textContent = `Liked by ${count} ${count === 1 ? 'person' : 'people'}`;
                    newLink.onclick = () => showLikers(postId);
                    actionsDiv.appendChild(newLink);
                }
            }
        } else if (likersLink) {
            // Remove the link if count becomes 0
            likersLink.remove();
        }

    } catch (err) {
        console.error("Failed to refresh post:", err);
    }
}

// ====================== TOGGLE LIKE / UNLIKE ======================
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

// Helper to get current user's full name from members table
async function getCurrentUserFullName() {
  if (!currentUser) return "Crew Member";

  try {
    const { data: member, error } = await supabaseClient
      .from('members')
      .select('full_name')
      .eq('id', currentUser.id)
      .single();

    if (error) {
      console.warn("Could not fetch full name, using email instead");
      return currentUser.email ? currentUser.email.split('@')[0] : "Crew Member";
    }

    return member?.full_name && member.full_name.trim() !== ''
      ? member.full_name.trim()
      : (currentUser.email ? currentUser.email.split('@')[0] : "Crew Member");

  } catch (err) {
    console.error("Error fetching full name:", err);
    return currentUser.email ? currentUser.email.split('@')[0] : "Crew Member";
  }
}

async function voteOnPoll(postId, option) {
  if (!currentUser) return alert("You must be logged in to vote.");
  const { data: post } = await supabaseClient.from('posts').select('poll_votes, user_votes').eq('id', postId).single();
  let pollVotes = post.poll_votes || {};
  let userVotes = post.user_votes || {};

  if (userVotes[currentUser.id]) return alert("You have already voted on this poll!");

  userVotes[currentUser.id] = option;
  pollVotes[option] = (pollVotes[option] || 0) + 1;

  const { error } = await supabaseClient.from('posts').update({ poll_votes: pollVotes, user_votes: userVotes }).eq('id', postId);
  if (!error) {
    alert(`You voted for: ${option}`);
    loadFeed(currentSort);
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

function toggleCommentBox(postId) {
  const box = document.getElementById(`comment-box-${postId}`);
  if (box) {
    box.style.display = (box.style.display === 'none' || !box.style.display) ? 'block' : 'none';
  }
}

//////////////POLL MODAL FUNCTIONS ///////////////////////

function showPollModal() {
  pollOptions = ["", ""];
  const modal = document.getElementById('pollModal');
  if (modal) modal.style.display = 'flex';
  
  document.getElementById('pollQuestion').value = '';
  renderPollOptions();
  document.getElementById('pollQuestion').focus();
}

function hidePollModal() {
  const modal = document.getElementById('pollModal');
  if (modal) modal.style.display = 'none';
}

function renderPollOptions() {
  const container = document.getElementById('pollOptionsContainer');
  if (!container) return;
  
  container.innerHTML = '';
  pollOptions.forEach((option, index) => {
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'poll-option-input';
    input.placeholder = `Option ${index + 1}`;
    input.value = option;
    input.addEventListener('input', () => {
      pollOptions[index] = input.value.trim();
    });
    container.appendChild(input);
  });
}

function addPollOption() {
  pollOptions.push("");
  renderPollOptions();
}

async function createPoll() {
  if (!currentUser) return alert("You must be logged in.");

  const question = document.getElementById('pollQuestion').value.trim();
  const validOptions = pollOptions.filter(opt => opt.length > 0);

  if (!question) return alert("Please enter a poll question.");
  if (validOptions.length < 2) return alert("Please add at least 2 options.");

  const displayName = await getCurrentUserFullName();

  const { error } = await supabaseClient.from('posts').insert({
    user_id: currentUser.id,
    full_name: displayName,                    // ← Full name
    content: question,
    post_type: 'poll',
    poll_options: validOptions,
    poll_votes: {},
    likes: 0
  });

  if (error) {
    alert("Failed to create poll: " + error.message);
  } else {
    hidePollModal();
    alert("✅ Poll posted successfully!");
    loadFeed(currentSort);
  }
}


// ====================== EVENT FUNCTIONS ======================
function showEventModal() {
  const modal = document.getElementById('eventModal');
  if (modal) {
    modal.style.display = 'flex';
    // Clear form when opening
    document.getElementById('eventTitle').value = '';
    document.getElementById('eventDate').value = '';
    document.getElementById('eventLocation').value = '';
    document.getElementById('eventDesc').value = '';
  }
}

function hideEventModal() {
  const modal = document.getElementById('eventModal');
  if (modal) modal.style.display = 'none';
}

async function createEvent() {
    if (!currentUser) return alert("You must be logged in.");

    const title       = document.getElementById('eventTitle').value.trim();
    const dateInput   = document.getElementById('eventDate').value;   // "2026-04-29T23:15"
    const location    = document.getElementById('eventLocation').value.trim();
    const description = document.getElementById('eventDesc').value.trim();

    if (!title || !dateInput) return alert("Title and date/time are required.");

    const displayName = await getCurrentUserFullName();

    const { error } = await supabaseClient.from('posts').insert({
        user_id: currentUser.id,
        full_name: displayName,
        content: description || null,
        post_type: 'event',
        event_title: title,
        event_date: dateInput,                    // ← Save exactly what user picked
        event_location: location || null,
        event_description: description || null,
        likes: 0
    });

    if (error) {
        alert("Failed to create event: " + error.message);
    } else {
        hideEventModal();
        alert("✅ Event created successfully!");
        loadFeed(currentSort);
        if (typeof renderCalendar === 'function') renderCalendar();
    }
}

// ====================== OPEN MEMBER MODAL (Updated for dropdowns) ======================
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

// ====================== SAVE MEMBER (Updated for dropdowns) ======================
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

async function deleteMember(id) {
  if (!confirm('Are you sure you want to delete this member?')) return;
  const { error } = await supabaseClient.from('members').delete().eq('id', id);
  if (error) alert('Error deleting member: ' + error.message);
  else loadMembers();
}

async function editMember(id) {
  const { data, error } = await supabaseClient.from('members').select('*').eq('id', id).single();
  if (error || !data) return alert('Error loading member data');
  openMemberModal(data);
}

async function logout() {
  await supabaseClient.auth.signOut();
  window.location.href = 'auth/login.html';
}

// ====================== IMPROVED LOAD USER ======================
async function loadUser() {
    try {
        const { data: { user }, error } = await supabaseClient.auth.getUser();
        
        if (error) {
            console.error("Auth error:", error);
            currentUser = null;
            return null;
        }

        if (!user) {
            console.warn("No user logged in");
            currentUser = null;
            return null;
        }

        currentUser = user;
        console.log("✅ Current user loaded:", currentUser.id, currentUser.email);
        return currentUser;
        
    } catch (err) {
        console.error("Error loading user:", err);
        currentUser = null;
        return null;
    }
}
function setupImagePreview() {
    const imageInput = document.getElementById('imageUpload');
    const previewContainer = document.getElementById('imagePreview');
    if (!imageInput) return;

    imageInput.addEventListener('change', (e) => {
        selectedFiles = Array.from(e.target.files);
        previewContainer.innerHTML = '';
        selectedFiles.forEach(file => {
            const reader = new FileReader();
            reader.onload = (ev) => {
                const img = document.createElement('img');
                img.src = ev.target.result;
                img.style.width = '80px';
                img.style.height = '80px';
                img.style.objectFit = 'cover';
                img.style.borderRadius = '8px';
                img.style.border = '2px solid #00C7B2';
                previewContainer.appendChild(img);
            };
            reader.readAsDataURL(file);
        });
    });
}

// ====================== CREATE TEXT POST ======================
async function createTextPost() {
  if (!currentUser) return alert("You must be logged in to post.");

  const content = document.getElementById('postContent').value.trim();
  const imageUrls = [];

  // Handle image uploads
  if (selectedFiles.length > 0) {
    for (let file of selectedFiles) {
      const fileName = `${Date.now()}-${Math.random().toString(36).slice(2)}.${file.name.split('.').pop()}`;
      
      const { error: uploadError } = await supabaseClient.storage
        .from('post-images')
        .upload(fileName, file, { cacheControl: '3600', upsert: false });

      if (uploadError) {
        console.error("Upload error:", uploadError);
        return alert("Image upload failed: " + uploadError.message);
      }

      const { data: urlData } = supabaseClient.storage
        .from('post-images')
        .getPublicUrl(fileName);

      if (urlData?.publicUrl) {
        imageUrls.push(urlData.publicUrl);
      }
    }
  }

  // ←←← THIS WAS THE MISSING PART
  const displayName = await getCurrentUserFullName();

  const { error } = await supabaseClient.from('posts').insert({
    user_id: currentUser.id,
    full_name: displayName,                    // Now correctly uses full name
    content: content || null,
    post_type: 'text',
    image_urls: imageUrls.length ? imageUrls : null,
    likes: 0
  });

  if (error) {
    alert("Post failed: " + error.message);
  } else {
    // Clear form
    document.getElementById('postContent').value = '';
    document.getElementById('imageUpload').value = '';
    document.getElementById('imagePreview').innerHTML = '';
    selectedFiles = [];

    alert("Post shared successfully!");
    loadFeed(currentSort);
  }
}
// ====================== CERTIFICATION BADGES (with Training support) ======================
function getMemberBadges(member) {
    const badges = [];

    const addBadge = (area, className, displayText) => {
        badges.push(`<span class="cert-badge ${className}">${displayText}</span>`);
    };

    if (member.supervisor_status === 'Yes') addBadge('supervisor', 'supervisor', 'Supervisor');
    else if (member.supervisor_status === 'Training') addBadge('supervisor', 'training', 'Supervisor (Training)');

    if (member.lh_status === 'Yes') addBadge('lh', 'lh', 'LH');
    else if (member.lh_status === 'Training') addBadge('lh', 'training', 'LH (Training)');

    if (member.pt_status === 'Yes') addBadge('pt', 'pt', 'PT');
    else if (member.pt_status === 'Training') addBadge('pt', 'training', 'PT (Training)');

    if (member.demin_status === 'Yes') addBadge('demin', 'demin', 'Demin');
    else if (member.demin_status === 'Training') addBadge('demin', 'training', 'Demin (Training)');

    if (member.field_status === 'Yes') addBadge('field', 'field', 'Field');
    else if (member.field_status === 'Training') addBadge('field', 'training', 'Field (Training)');

    if (member.comp_status === 'Yes') addBadge('comp', 'comp', 'Comp');
    else if (member.comp_status === 'Training') addBadge('comp', 'training', 'Comp (Training)');

    if (member.panel_status === 'Yes') addBadge('panel', 'panel', 'Panel');
    else if (member.panel_status === 'Training') addBadge('panel', 'training', 'Panel (Training)');

    return badges.join('');
}
// ====================== SCHEDULE / CALENDAR FUNCTIONS ======================
async function loadSchedule() {
  const { data, error } = await supabaseClient
    .from('schedule')
    .select('*')
    .order('date');

  if (error) {
    console.error("Failed to load schedule:", error);
    scheduleData = {};
    return;
  }

  scheduleData = {};
  data.forEach(item => {
    const dateStr = item.date;
    if (!scheduleData[dateStr]) scheduleData[dateStr] = [];
    scheduleData[dateStr].push({
      id: item.id,
      name: item.member_name,
      area: item.area,
      status: item.status
    });
  });
}

// ====================== DELETE SHIFT ======================
async function deleteShift(shiftId, dateStr) {
    const hasPermission = await hasScheduleEditPermission();
    if (!hasPermission) {
        return alert("❌ Only Supervisors and LH certified members can delete shifts.");
    }

    if (!confirm("Delete this shift permanently?")) return;

    const { error } = await supabaseClient
        .from('schedule')
        .delete()
        .eq('id', shiftId);

    if (error) {
        console.error(error);
        alert("Failed to delete shift: " + error.message);
    } else {
        alert("✅ Shift deleted.");
        await loadSchedule();
        showDayDetails(dateStr);   // Refresh the panel
    }
}

// Expose to global scope so onclick works
window.deleteShift = deleteShift;

async function renderCalendar() {
    resetAllModalsAndSelections();   // ← Critical: reset FIRST

    const grid = document.getElementById('calendarGrid');
    if (!grid) return;

    grid.innerHTML = '';

    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();

    document.getElementById('monthYear').textContent = currentDate.toLocaleString('default', { 
        month: 'long', year: 'numeric' 
    });

    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    await loadEventsForMonth(year, month);

    // Previous month padding
    for (let i = firstDay - 1; i >= 0; i--) {
        const empty = document.createElement('div');
        empty.className = 'calendar-day other-month';
        grid.appendChild(empty);
    }

    // Current month days
    for (let day = 1; day <= daysInMonth; day++) {
        const dateStr = `${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
        
        const dayEl = document.createElement('div');
        dayEl.className = 'calendar-day';
        dayEl.dataset.date = dateStr;

        if (isSameDayInMountainTime(dateStr)) dayEl.classList.add('today');
        if (isWorkingDay(dateStr)) dayEl.classList.add('work-day');

        dayEl.innerHTML = `<span>${day}</span>`;

        // === SINGLE UNIFIED FLAG ===
    if (isWorkingDay(dateStr)) {
        const flags = getDayFlags(dateStr);
        
        if (flags.hasFlag) {
            const flagEl = document.createElement('div');
            flagEl.className = 'unified-flag';
            flagEl.innerHTML = '🚩';
            
            // Better tooltip
            flagEl.title = `Day Summary (${flags.totalWorking} working shifts)\n\n` + 
                          flags.reasons.join('\n\n');
            
            flagEl.addEventListener('click', (e) => {
                e.stopPropagation();
                alert(`Flags for ${dateStr} (${flags.totalWorking} working shifts):\n\n` + 
                      flags.reasons.join('\n\n'));
            });

            dayEl.appendChild(flagEl);
        }
    }

        // Event icon
        if (eventsThisMonth[dateStr] && eventsThisMonth[dateStr].length > 0) {
            const icon = document.createElement('div');
            icon.className = 'event-icon';
            icon.innerHTML = '📅';
            icon.addEventListener('click', (e) => { 
                e.stopPropagation(); 
                showDayDetails(dateStr); 
            });
            dayEl.appendChild(icon);
        }

        dayEl.addEventListener('click', (e) => handleDayClick(e, dayEl));
        dayEl.addEventListener('mousedown', (e) => startDrag(e, dayEl));
        dayEl.addEventListener('touchstart', (e) => startDrag(e, dayEl), { passive: false });

        grid.appendChild(dayEl);
    }

    // Next month padding
    const remaining = 42 - (firstDay + daysInMonth);
    for (let i = 1; i <= remaining; i++) {
        const empty = document.createElement('div');
        empty.className = 'calendar-day other-month';
        grid.appendChild(empty);
    }

    renderShiftAreaChart();
}

// ====================== POST OT SHIFT FUNCTIONS ======================
function showPostOTModal() {
    hasScheduleEditPermission().then(hasPerm => {
        if (!hasPerm) {
            return alert("❌ Only Supervisors and LH members can post OT shifts.");
        }

        // Populate areas
        const areaSelect = document.getElementById('otArea');
        if (areaSelect) {
            areaSelect.innerHTML = '<option value="">Any Area (Optional)</option>';
            FIXED_AREAS.forEach(a => {
                const opt = document.createElement('option');
                opt.value = a.key;
                opt.textContent = a.label;
                areaSelect.appendChild(opt);
            });
        }

        // Clear form
        if (document.getElementById('otDate')) document.getElementById('otDate').value = '';
        if (document.getElementById('otShiftType')) document.getElementById('otShiftType').value = 'Day';
        if (document.getElementById('otDescription')) document.getElementById('otDescription').value = '';

        document.getElementById('postOTModal').style.display = 'flex';
    }).catch(err => console.error(err));
}

function hidePostOTModal() {
    const modal = document.getElementById('postOTModal');
    if (modal) modal.style.display = 'none';
}

async function postOTShift() {
    const hasPerm = await hasScheduleEditPermission();
    if (!hasPerm) return alert("❌ Permission denied.");

    const date = document.getElementById('otDate')?.value;
    const shiftType = document.getElementById('otShiftType')?.value || 'Day';
    const area = document.getElementById('otArea')?.value || null;
    const description = document.getElementById('otDescription')?.value?.trim() || null;
    const hours = parseFloat(document.getElementById('otHours')?.value) || 12;

    if (!date) return alert("Please select a date.");

    const { error } = await supabaseClient
        .from('overtime_shifts')
        .insert([{
            date: date,
            shift_type: shiftType,
            area: area,
            description: description,
            hours: hours,           // ← Now saves custom hours (defaults to 12)
            posted_by: currentUser?.id,
            status: 'open'
        }]);

    if (error) {
        console.error(error);
        alert("Failed to post OT shift:\n" + error.message);
    } else {
        alert(`✅ ${hours}-hour OT shift posted successfully!`);
        hidePostOTModal();
        loadOpenOTShifts();
    }
}
// ====================== OVERTIME FUNCTIONS ======================

async function loadOTLeaderboard() {
    const tbody = document.getElementById('otLeaderboard')?.querySelector('tbody');
    if (!tbody) return;

    const hasEditPermission = await hasScheduleEditPermission();

    const { data: shifts } = await supabaseClient
        .from('overtime_shifts')
        .select('*')
        .eq('status', 'assigned')
        .order('assigned_at', { ascending: false });

    const otMap = {};
    (shifts || []).forEach(s => {
        const name = s.assigned_to;
        if (!otMap[name]) otMap[name] = { hours: 0, count: 0, shifts: [] };
        otMap[name].hours += Number(s.hours || 12);
        otMap[name].count++;
        otMap[name].shifts.push(s);
    });

    const sorted = Object.entries(otMap).sort((a, b) => a[1].hours - b[1].hours);

    tbody.innerHTML = sorted.length 
        ? sorted.map(([name, stats]) => `
            <tr style="cursor:pointer;" onclick="showOTMemberDetails('${name}')">
                <td style="padding:14px;"><strong>${name}</strong></td>
                <td style="text-align:center; font-size:1.4rem; font-weight:700; color:#00C7B2;">
                    ${stats.hours}
                </td>
                <td style="text-align:center;">${stats.count} shifts</td>
            </tr>`).join('')
        : `<tr><td colspan="3" style="padding:60px; text-align:center; color:#94a3b8;">No assigned OT yet</td></tr>`;
}

// ====================== OT MEMBER DETAIL MODAL ======================
async function showOTMemberDetails(memberName) {
    const hasPerm = await hasScheduleEditPermission();

    const { data: shifts } = await supabaseClient
        .from('overtime_shifts')
        .select('*')
        .eq('assigned_to', memberName)
        .eq('status', 'assigned')
        .order('date', { ascending: false });

    let html = `<h3 style="margin:0 0 16px 0; color:#00C7B2;">${memberName} — All OT Shifts</h3>`;

    if (!shifts || shifts.length === 0) {
        html += `<p style="color:#94a3b8;">No assigned shifts found.</p>`;
    } else {
        html += `<div style="display:flex; flex-direction:column; gap:10px;">`;
        shifts.forEach(shift => {
            html += `
                <div style="background:rgba(255,255,255,0.06); padding:14px; border-radius:10px; display:flex; justify-content:space-between; align-items:center;">
                    <div>
                        <strong>${shift.date} — ${shift.shift_type}</strong><br>
                        <span style="color:#a0d8ff;">${shift.hours || 12} hours</span>
                        ${shift.area ? ` • ${shift.area}` : ''}
                        ${shift.description ? `<br><small>${shift.description}</small>` : ''}
                    </div>
                    ${hasPerm ? `
<div class="ot-action-group">
    <button onclick="editOTShift('${shift.id}'); event.stopImmediatePropagation();" 
            class="ot-action-btn ot-edit-btn">Edit Hours</button>
    <button onclick="deleteOTShift('${shift.id}'); event.stopImmediatePropagation();" 
            class="ot-action-btn ot-delete-btn">Delete</button>
</div>` : ''}
                </div>`;
        });
        html += `</div>`;
    }

    document.getElementById('otDetailContent').innerHTML = html;
    document.getElementById('detailMemberName').textContent = `${memberName}'s OT History`;
    document.getElementById('otDetailModal').style.display = 'flex';
}

function hideOTDetailModal() {
    document.getElementById('otDetailModal').style.display = 'none';
}

let currentEditingOTId = null;

function hideOTEditModal() {
    document.getElementById('otEditModal').style.display = 'none';
}

async function editOTShift(shiftId) {
    const hasPerm = await hasScheduleEditPermission();
    if (!hasPerm) return alert("❌ Permission denied.");

    const { data: shift } = await supabaseClient
        .from('overtime_shifts')
        .select('*')
        .eq('id', shiftId)
        .single();

    if (!shift) return alert("Shift not found.");

    currentEditingOTId = shiftId;

    // Basic fields
    document.getElementById('editOtDate').value = shift.date;
    document.getElementById('editOtShiftType').value = shift.shift_type;
    document.getElementById('editOtHours').value = shift.hours || 12;
    document.getElementById('editOtDescription').value = shift.description || '';

    // === Load ONLY certified areas (Yes OR Training) ===
    const { data: member } = await supabaseClient
        .from('members')
        .select('*')
        .eq('full_name', shift.assigned_to)
        .single();

    const areaSelect = document.getElementById('editOtArea');
    areaSelect.innerHTML = '<option value="">Floater</option>';

    if (member) {
        FIXED_AREAS.forEach(a => {
            let isQualified = false;

            if (a.key === "Supervisor") {
                isQualified = member.supervisor_status === 'Yes' || member.supervisor_status === 'Training';
            } 
            else if (a.key === "LH") {
                isQualified = member.lh_status === 'Yes' || member.lh_status === 'Training';
            } 
            else if (a.key === "Pretreat") {
                isQualified = member.pt_status === 'Yes' || member.pt_status === 'Training';
            } 
            else if (a.key === "Demin") {
                isQualified = member.demin_status === 'Yes' || member.demin_status === 'Training';
            } 
            else if (a.key.startsWith("Field")) {
                isQualified = member.field_status === 'Yes' || member.field_status === 'Training';
            } 
            else if (a.key.startsWith("Comp")) {
                isQualified = member.comp_status === 'Yes' || member.comp_status === 'Training';
            } 
            else if (a.key.startsWith("Panel")) {
                isQualified = member.panel_status === 'Yes' || member.panel_status === 'Training';
            }

            if (isQualified) {
                const opt = document.createElement('option');
                opt.value = a.key;
                opt.textContent = a.label;
                if (a.key === shift.area) opt.selected = true;
                areaSelect.appendChild(opt);
            }
        });
    }

    document.getElementById('otEditModal').style.display = 'flex';
}

async function saveOTEdit() {
    if (!currentEditingOTId) return alert("No shift selected.");

    const hours = parseFloat(document.getElementById('editOtHours').value) || 12;
    const area = document.getElementById('editOtArea').value || null;
    const description = document.getElementById('editOtDescription').value.trim();

    // Get current OT shift info
    const { data: otShift, error: fetchError } = await supabaseClient
        .from('overtime_shifts')
        .select('date, assigned_to')
        .eq('id', currentEditingOTId)
        .single();

    if (fetchError || !otShift) {
        return alert("Could not find the OT shift.");
    }

    // 1. Update the OT shift
    const { error: otError } = await supabaseClient
        .from('overtime_shifts')
        .update({
            hours: hours,
            area: area,
            description: description
        })
        .eq('id', currentEditingOTId);

    if (otError) {
        return alert("Failed to update OT shift: " + otError.message);
    }

    // 2. Update the matching shift in the main schedule
    if (otShift.date && otShift.assigned_to) {
        const { error: schedError } = await supabaseClient
            .from('schedule')
            .update({
                area: area || "Floater",
                is_floater: area === null || area === ""
            })
            .eq('date', otShift.date)
            .eq('member_name', otShift.assigned_to)
            .eq('status', 'working');   // Only update working shifts

        if (schedError) {
            console.warn("Schedule update warning (this is okay):", schedError);
        } else {
            console.log("✅ Main schedule also updated");
        }
    }

    alert("✅ OT Shift updated successfully. Added to main schedule!");

    hideOTEditModal();
    hideOTDetailModal();
    await loadOTLeaderboard();
    await loadOpenOTShifts();
}

function hideOTEditModal() {
    document.getElementById('otEditModal').style.display = 'none';
}

async function deleteOTShift(shiftId) {
    const hasPerm = await hasScheduleEditPermission();
    if (!hasPerm) {
        return alert("❌ Permission denied.");
    }

    if (!confirm("🗑️ Delete this OT shift permanently?\n\nThis will ALSO remove it from the main Crew Schedule if it exists.")) {
        return;
    }

    // Get OT shift details first (so we can clean up schedule)
    const { data: otShift } = await supabaseClient
        .from('overtime_shifts')
        .select('date, assigned_to')
        .eq('id', shiftId)
        .single();

    // Delete from OT table
    const { error: otError } = await supabaseClient
        .from('overtime_shifts')
        .delete()
        .eq('id', shiftId);

    if (otError) {
        console.error(otError);
        return alert("Failed to delete OT shift: " + otError.message);
    }

    // === Also delete from main schedule ===
    if (otShift && otShift.date && otShift.assigned_to) {
        const { error: scheduleError } = await supabaseClient
            .from('schedule')
            .delete()
            .eq('date', otShift.date)
            .eq('member_name', otShift.assigned_to);

        if (scheduleError) {
            console.warn("Schedule cleanup warning:", scheduleError);
            // Don't block the delete if schedule cleanup fails
        }
    }

    alert("✅ OT shift deleted and removed from main schedule.");

    // Refresh everything
    hideOTDetailModal();
    await loadOTLeaderboard();
    await loadOpenOTShifts();
}
async function loadOpenOTShifts() {
    const container = document.getElementById('openOTContainer');
    if (!container) return;

    const { data: shifts } = await supabaseClient
        .from('overtime_shifts')
        .select('*')
        .eq('status', 'open')
        .order('date', { ascending: true });

    if (!shifts || shifts.length === 0) {
        container.innerHTML = `<p style="color:#94a3b8; text-align:center; padding:60px;">No open overtime shifts right now.</p>`;
        return;
    }

    let html = '';

    for (const shift of shifts) {
        // Simple query - no join needed
        const { data: bids } = await supabaseClient
            .from('overtime_bids')
            .select('member_name, created_at')
            .eq('overtime_shift_id', shift.id)
            .order('created_at', { ascending: true });

        const bidCount = bids ? bids.length : 0;
        const bidderList = bids && bids.length 
            ? bids.map(b => b.member_name).join(', ')
            : 'No bids yet';

        html += `
            <div class="card" style="margin-bottom:20px; padding:18px;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
                    <strong style="font-size:1.1rem;">
                        ${shift.date} — ${shift.shift_type}
                        ${shift.area ? `<span style="color:#00C7B2;">(${shift.area})</span>` : ''}
                    </strong>
                    <button onclick="placeBid('${shift.id}')" class="save-btn" style="padding:8px 20px;">Bid</button>
                </div>
                
                ${shift.description ? `<p style="margin:8px 0 12px; color:#a0d8ff;">${shift.description}</p>` : ''}

                ${shift.hours ? `<strong style="color:#00C7B2;">${shift.hours} hours</strong>` : ''}
                <div style="background:rgba(255,255,255,0.06); padding:12px; border-radius:10px; font-size:0.95rem;">
                    <strong>Bids (${bidCount})</strong><br>
                    <span style="color:#bae6fd;">${bidderList}</span>
                </div>

                ${await hasScheduleEditPermission() ? `
                <button onclick="awardOTShift('${shift.id}')" 
        class="ot-action-btn ot-edit-btn" style="margin-top:12px;">
    Award to Lowest OT
</button>` : ''}
            </div>
        `;
    }

    container.innerHTML = html;
}

async function placeBid(shiftId) {
    if (!currentUser) return alert("Please log in to bid.");

    const { data: member } = await supabaseClient
        .from('members')
        .select('full_name')
        .eq('id', currentUser.id)
        .single();

    const fullName = member?.full_name?.trim() || 
                    (currentUser.email ? currentUser.email.split('@')[0] : "Unknown");

    const { error } = await supabaseClient
        .from('overtime_bids')
        .insert([{
            overtime_shift_id: shiftId,
            member_name: fullName,
            user_id: currentUser.id
        }]);

    if (error) {
        if (error.message.includes('duplicate')) {
            alert("You have already bid on this shift.");
        } else {
            alert("Error placing bid: " + error.message);
        }
    } else {
        alert(`✅ Bid placed as ${fullName}`);
        loadOpenOTShifts();   // Refresh immediately
    }
}

async function awardOTShift(shiftId) {
    const hasPerm = await hasScheduleEditPermission();
    if (!hasPerm) {
        return alert("❌ Only Supervisors and LH can award shifts.");
    }

    // Get bids and determine winner
    const { data: bids } = await supabaseClient
        .from('overtime_bids')
        .select('member_name')
        .eq('overtime_shift_id', shiftId);

    if (!bids || bids.length === 0) {
        return alert("No bids on this shift yet.");
    }

    const uniqueBidders = [...new Set(bids.map(b => b.member_name))];

    const { data: allOT } = await supabaseClient
        .from('overtime_shifts')
        .select('assigned_to, hours')
        .in('assigned_to', uniqueBidders)
        .eq('status', 'assigned');

    const otTotals = {};
    (allOT || []).forEach(s => {
        otTotals[s.assigned_to] = (otTotals[s.assigned_to] || 0) + Number(s.hours || 12);
    });

    let winner = null;
    let lowestHours = Infinity;

    uniqueBidders.forEach(name => {
        const hours = otTotals[name] || 0;
        if (hours < lowestHours) {
            lowestHours = hours;
            winner = name;
        }
    });

    if (!winner) return alert("Could not determine winner.");

    // === 1. Award the OT shift ===
    const { data: otShift } = await supabaseClient
        .from('overtime_shifts')
        .select('*')
        .eq('id', shiftId)
        .single();

    const { error: awardError } = await supabaseClient
        .from('overtime_shifts')
        .update({
            status: 'assigned',
            assigned_to: winner,
            assigned_at: new Date().toISOString()
        })
        .eq('id', shiftId);

    if (awardError) {
        return alert("Failed to award OT: " + awardError.message);
    }

    // === 2. Ask for confirmation to add to main schedule ===
    const addToSchedule = confirm(
        `OT Shift awarded to ${winner} (${lowestHours} hours this year).\n\n` +
        `Add this shift to the main Crew Schedule for ${otShift.date}?\n` +
        `(Area: ${otShift.area || "Floater"})`
    );

    if (addToSchedule && otShift) {
        const scheduleEntry = {
            date: otShift.date,
            member_name: winner,
            area: otShift.area || "Floater",
            status: 'working',
            is_floater: !(otShift.area && otShift.area !== "Floater")
        };

        const { error: scheduleError } = await supabaseClient
            .from('schedule')
            .insert([scheduleEntry]);

        if (scheduleError) {
            console.error("Schedule insert error:", scheduleError);
            alert("OT awarded, but failed to add to main schedule.");
        } else {
            alert(`✅ Awarded to ${winner} and added to schedule!`);
        }
    } else {
        alert(`✅ Awarded to ${winner} (not added to schedule)`);
    }

    // Refresh views
    loadOpenOTShifts();
    loadOTLeaderboard();
}

// ====================== STRICT ONE WORKER PER AREA + BLOCK STABLE ======================
async function autoPopulateCurrentMonth() {
    const hasPermission = await hasScheduleEditPermission();
    if (!hasPermission) return alert("❌ Permission denied.");

    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const monthName = currentDate.toLocaleString('default', { month: 'long', year: 'numeric' });

    if (!confirm(`Generate schedule for ${monthName}?\n\n• Exactly ONE worker per area\n• Same worker stays in same area for entire block`)) {
        return;
    }

    const startStr = `${year}-${String(month+1).padStart(2,'0')}-01`;
    const endStr = `${year}-${String(month+1).padStart(2,'0')}-${new Date(year, month+1, 0).getDate()}`;

    // Clear existing non-vacation shifts
    await supabaseClient.from('schedule').delete()
        .gte('date', startStr).lte('date', endStr)
        .neq('status', 'vacation');

    const { data: membersData } = await supabaseClient
        .from('members').select('*').eq('status', 'Active');

    if (!membersData?.length) return alert("No active members found.");

    // Categorize members
    const supervisor = membersData.find(m => m.supervisor_status === 'Yes');
    const trainingWorkers = membersData.filter(m => 
        ['Yes','Training'].some(s => 
            m.supervisor_status === s || m.lh_status === s || m.pt_status === s ||
            m.demin_status === s || m.field_status === s || 
            m.comp_status === s || m.panel_status === s
        ) && m.supervisor_status !== 'Yes'
    );

    const regularWorkers = membersData.filter(m => 
        m !== supervisor && !trainingWorkers.some(t => t.full_name === m.full_name)
    );

    const inserts = [];
    let current = new Date(year, month, 1);
    window.currentBlockAssignments = new Map(); // Reset block memory

    while (current.getMonth() === month) {
        const dateStr = current.toISOString().split('T')[0];

        if (isWorkingDay(dateStr)) {
            const dayShifts = [];
            const usedToday = new Set();

            const cycleDay = getCycleDay(dateStr);
            const blockKey = getBlockKey(cycleDay);

            // === 1. TRAINING WORKERS (Locked to their training area) ===
            trainingWorkers.forEach(member => {
                const area = getTrainingArea(member);
                if (area) {
                    dayShifts.push(createShift(dateStr, member.full_name, area));
                    usedToday.add(member.full_name);
                }
            });

            // === 2. SUPERVISOR ===
            if (supervisor && !usedToday.has(supervisor.full_name)) {
                const isVacation = (cycleDay % 11 === 0);
                dayShifts.push(createShift(
                    dateStr, 
                    supervisor.full_name, 
                    isVacation ? "Vacation" : "Supervisor",
                    isVacation ? "vacation" : "working"
                ));
                usedToday.add(supervisor.full_name);
            }

            // === 3. STABLE BLOCK ASSIGNMENTS (One per area) ===
            if (!window.currentBlockAssignments.has(blockKey)) {
                const assignment = createStableBlockAssignment(regularWorkers, usedToday);
                window.currentBlockAssignments.set(blockKey, assignment);
            }

            const blockAssignment = window.currentBlockAssignments.get(blockKey);

            blockAssignment.forEach(ass => {
                if (!usedToday.has(ass.member_name)) {
                    dayShifts.push(createShift(dateStr, ass.member_name, ass.area));
                    usedToday.add(ass.member_name);
                }
            });

            // === 4. Any remaining workers become Floaters ===
            regularWorkers.forEach(member => {
                if (!usedToday.has(member.full_name)) {
                    dayShifts.push(createShift(dateStr, member.full_name, "Floater"));
                }
            });

            inserts.push(...dayShifts);
        }

        current.setDate(current.getDate() + 1);
    }

    const { error } = await supabaseClient.from('schedule').insert(inserts);

    if (error) {
        console.error(error);
        alert("Error generating schedule: " + error.message);
    } else {
        alert(`✅ ${monthName} schedule generated successfully!\n• Exactly 1 worker per area\n• Stable within each block`);
        window.currentBlockAssignments = null;
        await loadSchedule();
        await renderCalendar();
        renderMemberShiftBreakdown();
    }
}

// ====================== HELPERS ======================
function isStartOfNewBlock(cycleDay) {
    // These are the exact starting points of your desired stable blocks
    return [2, 4, 12, 14, 21, 24].includes(cycleDay);
}


function getTrainingArea(member) {
    if (member.supervisor_status === 'Training') return "Supervisor";
    if (member.lh_status === 'Training') return "LH";
    if (member.pt_status === 'Training') return "Pretreat";
    if (member.demin_status === 'Training') return "Demin";
    if (member.field_status === 'Training') return `Field ${Math.random() > 0.5 ? "2" : "1"}`;
    if (member.comp_status === 'Training') return `Comp ${Math.random() > 0.5 ? "2" : "1"}`;
    if (member.panel_status === 'Training') return `Panel ${Math.random() > 0.5 ? "2" : "1"}`;
    return null;
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

function getCycleDay(dateStr) {
    const date = new Date(dateStr);
    const diffTime = date.getTime() - rotationStartDate.getTime();
    const diffDays = Math.floor(diffTime / (1000 * 3600 * 24));
    return ((diffDays % rotationCycle) + rotationCycle) % rotationCycle;
}

function getBestAreaForMember(member) {
    const options = [];
    if (member.lh_status === 'Yes') options.push('LH');
    if (member.pt_status === 'Yes') options.push('Pretreat');
    if (member.demin_status === 'Yes') options.push('Demin');
    if (member.field_status === 'Yes') options.push(Math.random() > 0.5 ? 'Field 1' : 'Field 2');
    if (member.comp_status === 'Yes') options.push(Math.random() > 0.5 ? 'Comp 1' : 'Comp 2');
    if (member.panel_status === 'Yes') options.push(Math.random() > 0.5 ? 'Panel 1' : 'Panel 2');
    options.push('Floater'); // fallback
    return options[Math.floor(Math.random() * options.length)];
}
// ====================== CLEAR CURRENT MONTH (Preserves Vacations) ======================
async function clearCurrentMonth() {
    const hasPermission = await hasScheduleEditPermission();
    if (!hasPermission) {
        return alert("❌ Only Supervisors and LH certified members can clear the schedule.");
    }

    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const monthName = currentDate.toLocaleString('default', { month: 'long', year: 'numeric' });

    if (!confirm(`🗑️ Clear ALL non-vacation shifts for ${monthName}?\n\nVacation days will be preserved.`)) {
        return;
    }

    const startStr = `${year}-${String(month+1).padStart(2,'0')}-01`;
    const endStr = `${year}-${String(month+1).padStart(2,'0')}-${new Date(year, month+1, 0).getDate()}`;

    const { error } = await supabaseClient
        .from('schedule')
        .delete()
        .gte('date', startStr)
        .lte('date', endStr)
        .neq('status', 'vacation');   // ← This is the key change

    if (error) {
        console.error(error);
        alert("Failed to clear month: " + error.message);
    } else {
        alert(`✅ ${monthName} cleared (vacation days preserved).`);
        await loadSchedule();
        await renderCalendar();
        renderMemberShiftBreakdown();
    }
}

// ====================== EVENTS PAGE ======================
async function loadEventsPage() {
    const container = document.getElementById('eventsContainer');
    if (!container) return;

    container.innerHTML = '<p style="text-align:center; color:#94a3b8;">Loading events...</p>';

    const { data: events, error } = await supabaseClient
        .from('posts')
        .select('*')
        .eq('post_type', 'event')
        .order('event_date', { ascending: true });

    if (error) {
        container.innerHTML = `<p style="color:#ef4444;">Error loading events</p>`;
        return;
    }

    const now = new Date();
    const upcoming = [];
    const past = [];

    events.forEach(event => {
        const eventDate = new Date(event.event_date);
        if (eventDate >= now) {
            upcoming.push(event);
        } else {
            past.push(event);
        }
    });

    // Show Upcoming by default
    renderEvents(upcoming, 'upcoming');
}

function renderEvents(eventsList, tab) {
    const container = document.getElementById('eventsContainer');
    container.innerHTML = '';

    if (eventsList.length === 0) {
        container.innerHTML = `<p style="text-align:center; color:#94a3b8; padding:60px;">
            ${tab === 'upcoming' ? 'No upcoming events' : 'No past events'}
        </p>`;
        return;
    }

    eventsList.forEach(event => {
        const eventTime = new Date(event.event_date).toLocaleString('en-US', {
            weekday: 'long',
            month: 'long',
            day: 'numeric',
            year: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
            hour12: true
        });

        const createdTime = new Date(event.created_at).toLocaleString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
            hour12: true
        });

        const card = document.createElement('div');
        card.className = 'card';
        card.style.padding = '18px';

        card.innerHTML = `
            <h3 style="margin:0 0 8px 0; color:#00C7B2;">${event.event_title}</h3>
            <p><strong>📅 ${eventTime}</strong></p>
            ${event.event_location ? `<p><strong>📍 ${event.event_location}</strong></p>` : ''}
            ${event.event_description ? `<p style="margin-top:12px; color:#e0f0ff;">${event.event_description}</p>` : ''}
            <small style="color:#94a3b8;">Posted by ${event.full_name || 'Crew'} • ${createdTime}</small>
        `;

        container.appendChild(card);
    });
}

// Tab switching
function initEventsTabs() {
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            const tab = btn.dataset.tab;
            const { data: events } = await supabaseClient
                .from('posts')
                .select('*')
                .eq('post_type', 'event')
                .order('event_date', { ascending: true });

            const now = new Date();
            const filtered = tab === 'upcoming' 
                ? events.filter(e => new Date(e.event_date) >= now)
                : events.filter(e => new Date(e.event_date) < now);

            renderEvents(filtered, tab);
        });
    });
}

// ====================== HANDLE SINGLE CLICK ======================
function handleDayClick(e, dayEl) {
    if (isDragging) return;   // Don't trigger click during drag

    const dateStr = dayEl.dataset.date;
    if (!dateStr) return;

    if (multiSelectActive) {
        toggleDaySelection(dayEl);   // Add to selection (no deselect)
    } else {
        showDayDetails(dateStr);
    }
}

// ====================== IMPROVED MOBILE DRAG SELECTION ======================
let dragTimeout = null;

function startDrag(e, dayEl) {
    // Clear any previous timeout
    if (dragTimeout) clearTimeout(dragTimeout);

    isDragging = true;
    dragStartElement = dayEl;

    // Small delay before enabling multi-select (prevents accidental selection while scrolling)
    dragTimeout = setTimeout(() => {
        if (isDragging) {
            multiSelectActive = true;
            toggleDaySelection(dayEl);
        }
    }, 180); // 180ms delay — feels natural on mobile

    const moveHandler = (moveEvent) => onDragMove(moveEvent);
    const endHandler = () => endDrag(moveHandler, endHandler);

    document.addEventListener('mousemove', moveHandler);
    document.addEventListener('mouseup', endHandler);
    document.addEventListener('touchmove', moveHandler, { passive: false });
    document.addEventListener('touchend', endHandler);
}

function endDrag(moveHandler, endHandler) {
    isDragging = false;
    if (dragTimeout) {
        clearTimeout(dragTimeout);
        dragTimeout = null;
    }

    document.removeEventListener('mousemove', moveHandler);
    document.removeEventListener('mouseup', endHandler);
    document.removeEventListener('touchmove', moveHandler);
    document.removeEventListener('touchend', endHandler);

    // Only trigger bulk modal if we actually selected multiple days
    if (selectedDays.length > 1) {
        showBulkShiftModal();
    } else if (selectedDays.length === 1) {
        showDayDetails(selectedDays[0]);
        clearSelection();
    } else {
        clearSelection();
    }
}

function onDragMove(e) {
    if (!isDragging) return;
    if (e.preventDefault) e.preventDefault();

    let clientX = e.clientX || (e.touches && e.touches[0].clientX);
    let clientY = e.clientY || (e.touches && e.touches[0].clientY);

    const element = document.elementFromPoint(clientX, clientY);
    
    if (element && element.classList.contains('calendar-day') && element.dataset.date) {
        toggleDaySelection(element);
    }
}

function toggleDaySelection(dayEl) {
    const dateStr = dayEl.dataset.date;
    if (!dateStr || selectedDays.includes(dateStr)) return;   // ← Key change: no deselect

    selectedDays.push(dateStr);
    dayEl.classList.add('selected-range');
}

function endDrag(moveHandler, endHandler) {
    isDragging = false;
    document.removeEventListener('mousemove', moveHandler);
    document.removeEventListener('mouseup', endHandler);
    document.removeEventListener('touchmove', moveHandler);
    document.removeEventListener('touchend', endHandler);

    if (selectedDays.length > 1) {
        showBulkShiftModal();
    } else if (selectedDays.length === 1) {
        showDayDetails(selectedDays[0]);
        clearSelection();
    }
}

function clearSelection() {
    document.querySelectorAll('.calendar-day').forEach(el => {
        el.classList.remove('selected-range');
    });
    selectedDays = [];
    multiSelectActive = false;
}

function createDayElement(dayNum, isOtherMonth, dateStr = '') {
  const dayEl = document.createElement('div');
  dayEl.className = `calendar-day ${isOtherMonth ? 'other-month' : ''}`;

  if (dateStr && isSameDayInMountainTime(dateStr)) {
    dayEl.classList.add('today');
  }

  dayEl.innerHTML = `<span>${dayNum || ''}</span>`;

  if (dateStr && !isOtherMonth && isWorkingDay(dateStr)) {
    const dotsContainer = document.createElement('div');
    dotsContainer.className = 'shift-dots';
    const dot = document.createElement('div');
    dot.className = 'dot working rotation-dot';
    dotsContainer.appendChild(dot);
    dayEl.appendChild(dotsContainer);
  }

  if (dateStr && scheduleData[dateStr] && scheduleData[dateStr].length > 0) {
    let dotsContainer = dayEl.querySelector('.shift-dots');
    if (!dotsContainer) {
      dotsContainer = document.createElement('div');
      dotsContainer.className = 'shift-dots';
      dayEl.appendChild(dotsContainer);
    }
    scheduleData[dateStr].forEach(shift => {
      const dot = document.createElement('div');
      dot.className = `dot ${shift.status === 'vacation' ? 'vacation' : 'working'}`;
      dotsContainer.appendChild(dot);
    });
  }

  if (dateStr) {
    dayEl.addEventListener('click', () => showDayDetails(dateStr));
  }
  return dayEl;
}

function showDayDetails(dateStr) {
    const detailsPanel = document.getElementById('dayDetails');
    const dateTitle = document.getElementById('selectedDate');
    const list = document.getElementById('scheduleList');

    const displayDate = new Date(dateStr + 'T00:00:00');
    dateTitle.textContent = displayDate.toLocaleDateString('en-US', {
        weekday: 'long', month: 'long', day: 'numeric', year: 'numeric'
    });
    dateTitle.dataset.date = dateStr;
    list.innerHTML = '';

    const shifts = scheduleData[dateStr] || [];
    const events = eventsThisMonth[dateStr] || [];

    // Events first
    if (events.length > 0) {
        const h = document.createElement('h4'); 
        h.textContent = 'Events'; 
        h.style.color = '#eab308';
        list.appendChild(h);

        events.forEach(ev => {
            const div = document.createElement('div');
            div.className = 'shift-item event-item';

            // === FORCE MOUNTAIN TIME ===
            const eventTime = new Date(ev.event_date).toLocaleString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
});

div.innerHTML = `
    <strong>📅 ${ev.event_title}</strong><br>
    <span style="color:#a0d8ff;">${eventTime}</span><br>
    ${ev.event_location ? `<strong>📍 ${ev.event_location}</strong><br>` : ''}
    ${ev.event_description ? `<small>${ev.event_description}</small>` : ''}
`;
            list.appendChild(div);
        });
    }

    // Regular Shifts
    if (shifts.length > 0) {
        const h = document.createElement('h4'); 
        h.textContent = 'Shifts'; 
        h.style.margin = '15px 0 8px 0';
        list.appendChild(h);

        // ... your existing shift sorting and display code ...
        shifts.forEach(shift => {
            const item = document.createElement('div');
            item.className = `shift-item ${shift.status}`;
            item.style.position = 'relative';

            const areaText = shift.area === "Floater" ? 
                '<strong style="color:#f59e0b;">Float</strong>' : 
                `Area: ${shift.area}`;

            item.innerHTML = `
                <strong>${shift.name}</strong><br>
                ${areaText}
            `;

            const deleteX = document.createElement('button');
            deleteX.className = 'shift-delete-x';
            deleteX.innerHTML = '✕';
            deleteX.onclick = (e) => { e.stopPropagation(); deleteShift(shift.id, dateStr); };
            item.appendChild(deleteX);

            list.appendChild(item);
        });
    }

    if (shifts.length === 0 && events.length === 0) {
        list.innerHTML = `<p style="color:#9ca3af;">No shifts or events for this day.</p>`;
    }

    detailsPanel.classList.add('open');
}

function setupDayDetailsCloseButton() {
  const closeBtn = document.getElementById('closeDetails');
  if (closeBtn) closeBtn.addEventListener('click', () => document.getElementById('dayDetails').classList.remove('open'));
}

// ====================== BULK AREA ASSIGNMENT - QUALIFIED WORKERS ONLY ======================
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

let currentBulkTab = 0; // 0 = Crew Assignment, 1 = Book Time Off

async function showBulkShiftModal() {
    const modal = document.getElementById('bulkShiftModal');
    if (!modal) return alert("Bulk modal not found in HTML");

    document.getElementById('bulkDaysInfo').textContent = 
        `Assigning crew to ${selectedDays.length} selected day(s)`;
    document.getElementById('offDaysInfo').textContent = 
        `Mark OFF for ${selectedDays.length} selected day(s)`;

    // Reset to first tab
    switchBulkTab(0);

    // Populate Crew Assignment tab
    const container = document.getElementById('areaAssignmentsContainer');
    container.innerHTML = '';

    FIXED_AREAS.forEach(area => {
        const row = document.createElement('div');
        row.className = 'area-assignment-row';

        row.innerHTML = `
            <div class="area-label">${area.label}</div>
            <select class="area-member-select" data-area="${area.key}"></select>
        `;

        container.appendChild(row);

        const select = row.querySelector('.area-member-select');
        loadQualifiedMembersForArea(select, area.key);
    });

    // Populate Time Off members
    const offContainer = document.getElementById('offMembersContainer');
    offContainer.innerHTML = '';

    const { data: members } = await supabaseClient
        .from('members')
        .select('full_name')
        .eq('status', 'Active')
        .order('full_name');

    members.forEach(m => {
        const div = document.createElement('div');
        div.style.cssText = 'display:flex; align-items:center; gap:12px; padding:10px 14px; background:rgba(255,255,255,0.06); border-radius:10px;';
        div.innerHTML = `
            <input type="checkbox" class="off-member-check" value="${m.full_name}" style="transform:scale(1.4);">
            <span style="font-size:1.05rem;">${m.full_name}</span>
        `;
        offContainer.appendChild(div);
    });

    modal.classList.add('active');
}

function switchBulkTab(tab) {
    currentBulkTab = tab;
    document.querySelectorAll('.bulk-tab-btn').forEach((btn, i) => {
        btn.classList.toggle('active', i === tab);
    });
    document.getElementById('crewTab').style.display = tab === 0 ? 'block' : 'none';
    document.getElementById('offTab').style.display = tab === 1 ? 'block' : 'none';
}

async function applyBulkAction() {
    if (currentBulkTab === 0) {
        await applyBulkAreaAssignment();
    } else {
        await applyBulkTimeOff();
    }
}

async function applyBulkTimeOff() {
    const checkedBoxes = document.querySelectorAll('.off-member-check:checked');
    if (checkedBoxes.length === 0) {
        return alert("Please select at least one member to mark as OFF.");
    }

    const membersToOff = Array.from(checkedBoxes).map(cb => cb.value);

    const inserts = [];
    selectedDays.forEach(dateStr => {
        membersToOff.forEach(name => {
            inserts.push({
                date: dateStr,
                member_name: name,
                area: "OFF",
                status: 'vacation',
                is_floater: false
            });
        });
    });

    if (confirm(`Mark ${membersToOff.length} members as OFF for ${selectedDays.length} days?`)) {
        const { error } = await supabaseClient.from('schedule').insert(inserts);
        
        if (error) {
            alert("Error: " + error.message);
        } else {
            alert("✅ Time off booked successfully!");
            hideBulkShiftModal();
            await loadSchedule();
            await renderCalendar();
            renderMemberShiftBreakdown();
        }
    }
}

async function loadQualifiedMembersForArea(selectElement, areaKey) {
    const { data: members, error } = await supabaseClient
        .from('members')
        .select('*')
        .eq('status', 'Active')
        .order('full_name');

    if (error) return console.error(error);

    selectElement.innerHTML = '<option value="">— Leave Unassigned —</option>';

    members.forEach(member => {
        let isQualified = false;

        if (areaKey === "Supervisor") {
            isQualified = member.supervisor_status === 'Yes' || member.supervisor_status === 'Training';
        } else if (areaKey === "LH") {
            isQualified = member.lh_status === 'Yes' || member.lh_status === 'Training';
        } else if (areaKey === "Pretreat") {
            isQualified = member.pt_status === 'Yes' || member.pt_status === 'Training';
        } else if (areaKey === "Demin") {
            isQualified = member.demin_status === 'Yes' || member.demin_status === 'Training';
        } else if (areaKey.startsWith("Field")) {
            isQualified = member.field_status === 'Yes' || member.field_status === 'Training';
        } else if (areaKey.startsWith("Comp")) {
            isQualified = member.comp_status === 'Yes' || member.comp_status === 'Training';
        } else if (areaKey.startsWith("Panel")) {
            isQualified = member.panel_status === 'Yes' || member.panel_status === 'Training';
        }

        if (isQualified) {
            const opt = document.createElement('option');
            opt.value = member.full_name;
            opt.textContent = member.full_name;
            selectElement.appendChild(opt);
        }
    });
}

async function applyBulkAreaAssignment() {
    const hasPermission = await hasScheduleEditPermission();
    if (!hasPermission) return alert("❌ Permission denied.");

    const selects = document.querySelectorAll('.area-member-select');
    const assignments = {};

    selects.forEach(sel => {
        const area = sel.dataset.area;
        const memberName = sel.value.trim();
        if (memberName) {
            assignments[area] = memberName;
        }
    });

    if (Object.keys(assignments).length === 0) {
        return alert("Please assign at least one area.");
    }

    // Get all active members
    const { data: allMembers } = await supabaseClient
        .from('members')
        .select('full_name')
        .eq('status', 'Active');

    const assignedMembers = new Set(Object.values(assignments));

    // === CONFLICT CHECK ===
    let conflicts = [];
    for (const dateStr of selectedDays) {
        const existingShifts = scheduleData[dateStr] || [];
        
        Object.keys(assignments).forEach(area => {
            const member = assignments[area];
            const existing = existingShifts.find(s => s.name === member);
            if (existing) {
                conflicts.push(`${dateStr}: ${member} is already in ${existing.area}`);
            }
        });
    }

    let proceed = true;
    if (conflicts.length > 0) {
        const msg = `⚠️ ${conflicts.length} conflict(s) found:\n\n` +
                   conflicts.slice(0, 8).join('\n') +
                   (conflicts.length > 8 ? `\n... and ${conflicts.length-8} more` : '') +
                   `\n\nOverwrite these existing shifts?`;

        proceed = confirm(msg);
    }
    if (!proceed) return;

    // Build inserts
    const allInserts = [];

    selectedDays.forEach(dateStr => {
        const existingShifts = scheduleData[dateStr] || [];
        const alreadyScheduled = new Set(existingShifts.map(s => s.name));

        // 1. Assigned specific areas (always add/overwrite)
        Object.keys(assignments).forEach(area => {
            allInserts.push({
                date: dateStr,
                member_name: assignments[area],
                area: area,
                status: 'working',
                is_floater: false
            });
        });

        // 2. Only add Floaters for workers who have NO shift yet on this day
        allMembers.forEach(member => {
            const name = member.full_name;
            if (!assignedMembers.has(name) && !alreadyScheduled.has(name)) {
                allInserts.push({
                    date: dateStr,
                    member_name: name,
                    area: "Floater",
                    status: 'working',
                    is_floater: true
                });
            }
        });
    });

    if (allInserts.length === 0) return alert("No changes to make.");

    if (confirm(`Apply ${allInserts.length} shifts across ${selectedDays.length} days?`)) {
        const { error } = await supabaseClient.from('schedule').insert(allInserts);

        if (error) {
            alert("Error: " + error.message);
        } else {
            alert(`✅ Crew assigned successfully!`);
            hideBulkShiftModal();
            await loadSchedule();
            await renderCalendar();
            renderMemberShiftBreakdown();
        }
    }
}

function hideBulkShiftModal() {
    document.getElementById('bulkShiftModal').classList.remove('active');
    clearSelection();
}

// ====================== LOAD MEMBERS INTO DROPDOWN (with certifications) ======================
async function loadMembersIntoDropdown() {
    const memberSelect = document.getElementById('shiftMember');
    if (!memberSelect) return;

    const { data, error } = await supabaseClient
        .from('members')
        .select('*')
        .eq('status', 'Active')
        .order('full_name');

    if (error) {
        console.error("Error loading members:", error);
        return;
    }

    memberSelect.innerHTML = '<option value="">Select Member...</option>';

    data.forEach(member => {
        const option = document.createElement('option');
        option.value = member.full_name;
        option.textContent = member.full_name;
        // Store the full member object so we can access certifications later
        option.dataset.member = JSON.stringify(member);
        memberSelect.appendChild(option);
    });

    // Add change event to update areas when member is selected
    memberSelect.addEventListener('change', updateAvailableAreas);
}

// ====================== UPDATE AVAILABLE AREAS (Includes Floater) ======================
function updateAvailableAreas() {
    const memberSelect = document.getElementById('shiftMember');
    const areaSelect = document.getElementById('shiftArea');

    if (!memberSelect || !areaSelect) return;

    areaSelect.innerHTML = '<option value="">Select Area...</option>';

    const selectedOption = memberSelect.options[memberSelect.selectedIndex];
    if (!selectedOption || !selectedOption.dataset.member) return;

    const member = JSON.parse(selectedOption.dataset.member);

    // === Supervisors only get "Supervisor" ===
    if (member.supervisor_status === 'Yes' || member.supervisor_status === 'Training') {
        const opt = document.createElement('option');
        opt.value = "Supervisor";
        opt.textContent = "Supervisor";
        areaSelect.appendChild(opt);
        return;
    }

    // === Regular Members + Floater Option ===
    const areas = [];

    // Regular certified areas
    if (member.lh_status === 'Yes' || member.lh_status === 'Training') {
        areas.push({ value: "LH", text: "LH" });
    }
    if (member.pt_status === 'Yes' || member.pt_status === 'Training') {
        areas.push({ value: "Pretreat", text: "PT (Pretreat)" });
    }
    if (member.demin_status === 'Yes' || member.demin_status === 'Training') {
        areas.push({ value: "Demin", text: "Demin" });
    }
    if (member.field_status === 'Yes' || member.field_status === 'Training') {
        areas.push({ value: "Field 1", text: "Field 1" });
        areas.push({ value: "Field 2", text: "Field 2" });
    }
    if (member.comp_status === 'Yes' || member.comp_status === 'Training') {
        areas.push({ value: "Comp 1", text: "Comp 1" });
        areas.push({ value: "Comp 2", text: "Comp 2" });
    }
    if (member.panel_status === 'Yes' || member.panel_status === 'Training') {
        areas.push({ value: "Panel 1", text: "Panel 1" });
        areas.push({ value: "Panel 2", text: "Panel 2" });
    }

    // Always add Floater option for everyone
    areas.push({ value: "Floater", text: "Float" });

    // Populate dropdown
    areas.forEach(area => {
        const opt = document.createElement('option');
        opt.value = area.value;
        opt.textContent = area.text;
        areaSelect.appendChild(opt);
    });

    if (areas.length === 1) {  // Only Floater
        const opt = document.createElement('option');
        opt.value = "";
        opt.textContent = "No certified areas - Floater only";
        opt.disabled = true;
        areaSelect.appendChild(opt);
    }
}

async function addShift() {
    const hasPermission = await hasScheduleEditPermission();
    if (!hasPermission) {
        return alert("❌ Only Supervisors and LH certified members can add shifts.");
    }
    const dateStr = document.getElementById('selectedDate').dataset.date;
    const memberName = document.getElementById('shiftMember').value.trim();
    const status = document.getElementById('shiftStatus').value;
    let area = "";

    if (!dateStr) return alert("Please select a date first.");
    if (!memberName) return alert("Please select a member.");

    // Only require area if NOT on vacation
    if (status !== 'vacation') {
        area = document.getElementById('shiftArea').value.trim();
        if (!area) return alert("Please select an area.");
    } else {
        area = "Vacation";
    }

    const { error } = await supabaseClient.from('schedule').insert([{
        date: dateStr,
        member_name: memberName,
        area: area,
        status: status,
        is_floater: area === "Floater"
    }]);

    if (error) {
        alert("Failed to save shift: " + error.message);
    } else {
        alert(status === 'vacation' ? "✅ Vacation added successfully!" : "✅ Shift added successfully!");
        resetAddShiftForm();
        await loadSchedule();
        showDayDetails(dateStr);
    }
}

// ====================== EDIT & DELETE SHIFT FUNCTIONS ======================

async function editShift(shiftId, dateStr) {
    if (!shiftId) return;

    // Fetch the current shift data
    const { data: shift, error } = await supabaseClient
        .from('schedule')
        .select('*')
        .eq('id', shiftId)
        .single();

    if (error || !shift) {
        return alert("Could not load shift for editing.");
    }

    // Pre-fill the form
    document.getElementById('shiftMember').value = shift.member_name || '';
    document.getElementById('shiftArea').value = shift.area || '';
    document.getElementById('shiftStatus').value = shift.status || 'working';

    // Change the Add button to "Update Shift" temporarily
    const addButton = document.querySelector('#dayDetails button[onclick="addShift()"]');
    if (addButton) {
        addButton.textContent = "Update Shift";
        addButton.onclick = () => updateShift(shiftId, dateStr);
    }
    

    // Optional: Highlight that we're editing
    console.log(`Editing shift ${shiftId} on ${dateStr}`);
    renderMemberShiftBreakdown();
}

async function updateShift(shiftId, dateStr) {
    const hasPermission = await hasScheduleEditPermission();
    if (!hasPermission) {
        return alert("❌ Only Supervisors and LH certified members can update shifts.");
    }

    const memberName = document.getElementById('shiftMember').value.trim();
    const area = document.getElementById('shiftArea').value.trim();
    const status = document.getElementById('shiftStatus').value;

    if (!memberName || !area) {
        return alert("Member and Area are required.");
    }

    const { error } = await supabaseClient
        .from('schedule')
        .update({
            member_name: memberName,
            area: area,
            status: status,
            updated_at: new Date().toISOString()
        })
        .eq('id', shiftId);

    if (error) {
        alert("Failed to update shift: " + error.message);
    } else {
        alert("✅ Shift updated successfully!");
        resetAddShiftForm();
        await loadSchedule();
        showDayDetails(dateStr);
        renderMemberShiftBreakdown();
    }
}
async function deleteShift(shiftId, dateStr) {
    const hasPermission = await hasScheduleEditPermission();
    if (!hasPermission) {
        return alert("❌ Only Supervisors and LH certified members can delete shifts.");
    }

    if (!confirm("Delete this shift permanently?")) return;

    const { error } = await supabaseClient
        .from('schedule')
        .delete()
        .eq('id', shiftId);

    if (error) {
        alert("Failed to delete shift: " + error.message);
    } else {
        alert("✅ Shift deleted.");
        await loadSchedule();
        showDayDetails(dateStr);
        renderMemberShiftBreakdown();
    }
}

// Reset form back to "Add Shift" mode
function resetAddShiftForm() {
    document.getElementById('shiftMember').value = '';
    document.getElementById('shiftArea').value = '';
    document.getElementById('shiftStatus').value = 'working';

    const addButton = document.querySelector('#dayDetails button[onclick^="addShift"]') || 
                      document.querySelector('#dayDetails button');
    
    if (addButton) {
        addButton.textContent = "Add to Schedule";
        addButton.onclick = addShift;
    }
}

// ====================== GOLF SCRAMBLE LEADERBOARD ======================
function subscribeToGolfLeaderboard() {
    if (golfChannel) {
        console.log("Golf channel already subscribed");
        return;
    }

    golfChannel = supabaseClient.channel('golf-leaderboard')
        .on('postgres_changes', {
            event: '*',
            schema: 'public',
            table: 'golf_teams'
        }, (payload) => {
            console.log('Golf leaderboard changed via realtime:', payload.eventType);
            loadGolfLeaderboard();
        })
        .subscribe((status) => {
            console.log('Golf realtime subscription status:', status);
        });
}

// ====================== GOLF SCRAMBLE LEADERBOARD ======================
// ====================== GOLF SCRAMBLE (Fixed Edit) ======================
let currentGameId = null;
let golfGames = [];
let golfChannel = null;
let autoRefreshInterval = null;

async function loadGolfLeaderboard() {
  const tbody = document.getElementById('leaderboardBody');
  const titleEl = document.getElementById('currentGameTitle');

  if (!tbody) return;

  tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:60px;color:#00C7B2;">Loading...</td></tr>`;

  const { data: games } = await supabaseClient
    .from('golf_games')
    .select('*')
    .order('game_date', { ascending: false });

  golfGames = games || [];
  renderGameSelect();

  if (!currentGameId && games?.length) currentGameId = games[0].id;

  if (!currentGameId) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:80px;color:#9ca3af;">No games yet.<br><button onclick="showNewGameModal()" class="add-team-btn" style="margin-top:12px;">Create First Game</button></td></tr>`;
    return;
  }

  const currentGame = games.find(g => g.id === currentGameId);
  titleEl.textContent = currentGame ? currentGame.game_name : "Current Game";

  const { data: teams } = await supabaseClient
    .from('golf_teams')
    .select('*')
    .eq('game_id', currentGameId)
    .order('score', { ascending: true });

  tbody.innerHTML = '';

  if (!teams || teams.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:60px;color:#9ca3af;">No teams in this game yet.</td></tr>`;
    return;
  }

  teams.forEach((team, index) => {
    const scores = Array.isArray(team.hole_scores) ? team.hole_scores : [];
    const total = team.score || scores.reduce((sum, s) => sum + (s || 0), 0);
    const completed = scores.filter(s => s > 0).length;
    const toPar = total - 72;
    const toParText = toPar < 0 ? toPar : (toPar === 0 ? 'E' : `+${toPar}`);

    const row = document.createElement('tr');
    row.innerHTML = `
      <td style="font-weight:700;font-size:20px;color:#00C7B2;text-align:center;">${index+1}</td>
      <td style="font-weight:600;">${team.team_name}</td>
      <td style="color:#9ca3af;font-size:14px;">${team.players || '—'}</td>
      <td style="font-weight:700;font-size:22px;color:#00C7B2;">${total}</td>
      <td style="font-weight:500;">${toParText}</td>
      <td style="font-size:13px;color:#a0d8ff;">${completed}/18</td>
      <td><button onclick="editTeam('${team.id}')" style="background:none;border:none;color:#00C7B2;font-size:22px;cursor:pointer;">✏️</button></td>
    `;
    tbody.appendChild(row);
  });

  updateLastUpdatedTime();
}

function renderGameSelect() {
  const select = document.getElementById('gameSelect');
  if (!select) return;
  select.innerHTML = '';
  golfGames.forEach(game => {
    const opt = document.createElement('option');
    opt.value = game.id;
    opt.textContent = `${game.game_name} (${game.game_date})`;
    if (game.id === currentGameId) opt.selected = true;
    select.appendChild(opt);
  });
}

function loadCurrentGame() {
  currentGameId = document.getElementById('gameSelect').value;
  loadGolfLeaderboard();
}

// ====================== MODALS ======================
function showNewGameModal() {
  document.getElementById('newGameModal').style.display = 'flex';
}

function hideNewGameModal() {
  document.getElementById('newGameModal').style.display = 'none';
}

async function createNewGame() {
  const name = document.getElementById('newGameName').value.trim();
  if (!name) return alert("Game name required");
  
  const { data, error } = await supabaseClient
    .from('golf_games')
    .insert([{ game_name: name, course_name: document.getElementById('newCourseName').value.trim() || null }])
    .select()
    .single();

  if (error) return alert("Error: " + error.message);

  hideNewGameModal();
  currentGameId = data.id;
  loadGolfLeaderboard();
}

function showAddTeamModal() {
  resetTeamModal();
  document.getElementById('modalTeamTitle').textContent = 'Add New Team';
  document.getElementById('teamModal').style.display = 'flex';
}

function resetTeamModal() {
  document.getElementById('teamId').value = '';
  document.getElementById('teamName').value = '';
  document.getElementById('teamPlayers').value = '';
  generateHoleInputs();
}

function generateHoleInputs() {
  const container = document.getElementById('holeInputs');
  container.innerHTML = '';
  for (let i = 0; i < 18; i++) {
    const div = document.createElement('div');
    div.style.textAlign = 'center';
    div.innerHTML = `
      <small style="color:#9ca3af;">H${i+1}</small><br>
      <input type="number" min="1" max="15" value="" 
             class="hole-input" data-hole="${i}" 
             style="width:55px; padding:8px; text-align:center; font-size:1.1rem; border-radius:6px;">
    `;
    container.appendChild(div);
  }
}

async function editTeam(id) {
  const { data: team, error } = await supabaseClient
    .from('golf_teams')
    .select('*')
    .eq('id', id)
    .single();

  if (error || !team) return alert("Could not load team data");

  resetTeamModal();  // Clear previous state

  document.getElementById('modalTeamTitle').textContent = 'Edit Team Scores';
  document.getElementById('teamId').value = team.id;
  document.getElementById('teamName').value = team.team_name || '';
  document.getElementById('teamPlayers').value = team.players || '';

  // Fill hole scores
  const scores = Array.isArray(team.hole_scores) ? team.hole_scores : new Array(18).fill(0);
  document.querySelectorAll('.hole-input').forEach(input => {
    const holeIndex = parseInt(input.dataset.hole);
    if (scores[holeIndex] > 0) input.value = scores[holeIndex];
  });

  document.getElementById('teamModal').style.display = 'flex';
}

async function saveTeam() {
  const id = document.getElementById('teamId').value.trim();
  const holeInputs = document.querySelectorAll('.hole-input');

  const holeScores = Array.from(holeInputs).map(input => {
    const val = parseInt(input.value);
    return isNaN(val) || val < 1 ? 0 : val;
  });

  const totalScore = holeScores.reduce((a, b) => a + b, 0);

  const teamData = {
    team_name: document.getElementById('teamName').value.trim(),
    players: document.getElementById('teamPlayers').value.trim(),
    game_id: currentGameId,
    hole_scores: holeScores,
    score: totalScore,
    updated_at: new Date().toISOString()
  };

  if (!teamData.team_name) return alert("Team name is required!");

  let error;
  if (id) {
    ({ error } = await supabaseClient.from('golf_teams').update(teamData).eq('id', id));
  } else {
    ({ error } = await supabaseClient.from('golf_teams').insert([teamData]));
  }

  if (error) {
    console.error(error);
    return alert("Save failed: " + error.message);
  }

  hideTeamModal();
  await loadGolfLeaderboard();
  alert(id ? "✅ Scores updated!" : "✅ Team added!");
}

function hideTeamModal() {
  document.getElementById('teamModal').style.display = 'none';
}
// Force Mountain Time (Alberta)
function formatMountainTime(dateStr) {
    if (!dateStr) return "No date";
    
    const date = new Date(dateStr);
    
    return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Edmonton',   // Mountain Time
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
    }).format(date) + " (MT)";
}

// ====================== TIMEZONE HELPER ======================
const MOUNTAIN_TIMEZONE = 'America/Denver';

function getTodayInMountainTime() {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: MOUNTAIN_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  const parts = formatter.formatToParts(now);
  const year = parts.find(p => p.type === 'year').value;
  const month = parts.find(p => p.type === 'month').value;
  const day = parts.find(p => p.type === 'day').value;
  return `${year}-${month}-${day}`;
}

function isSameDayInMountainTime(dateStr) {
  const todayStr = getTodayInMountainTime();
  return dateStr === todayStr;
}

// ====================== TAB SYSTEM ======================
function initTabs() {
    const tabButtons = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');

    tabButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            tabButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            tabContents.forEach(content => content.style.display = 'none');

            const tabId = btn.dataset.tab + '-tab';
            const activeTab = document.getElementById(tabId);
            if (activeTab) {
                activeTab.style.display = 'block';
                
                // Refresh analytics when switching to those tabs
                if (btn.dataset.tab === 'memberchart') {
                    const selected = document.getElementById('memberChartSelect').value;
                    if (selected) renderMemberShiftChart(selected);
                }
                if (btn.dataset.tab === 'crewoverview') {
                    renderMemberShiftBreakdown();
                }
            }
        });
    });
}
// Temporary: Print User ID in console
window.showMyUserId = async function() {
    await loadUser();
    if (currentUser) {
        console.log("%cYour User ID:", "color: #00C7B2; font-size: 16px;", currentUser.id);
        alert("✅ Your User ID is:\n\n" + currentUser.id + "\n\nCopy this and send it to me!");
    } else {
        alert("Not logged in. Please log in first.");
    }
};
// ====================== MAIN INITIALIZATION ======================
document.addEventListener('DOMContentLoaded', async () => {

    // ====================== NAVBAR (Always loads on every page) ======================
    fetch('navbar.html')
        .then(response => response.text())
        .then(data => {
            const placeholder = document.getElementById('navbar-placeholder');
            if (placeholder) {
                placeholder.innerHTML = data;
                setTimeout(initMobileMenu, 120);
            }
        })
        .catch(err => console.error('Navbar load failed:', err));

    await loadUser();

    // ====================== PAGE-SPECIFIC INITIALIZATIONS ======================

    // Members Page
    if (document.getElementById('membersBody') || document.getElementById('membersList')) {
        loadMembers();
        const addBtn = document.getElementById('addMemberBtn');
        if (addBtn) addBtn.addEventListener('click', () => openMemberModal());
    }

        // Feed Page Setup - Poll & Event Listeners
    if (document.getElementById('feedContainer')) {
        await loadUser();
        setupImagePreview();
        await loadFeed('latest');
        subscribeToFeed();

        // Ensure modal buttons work
        const pollModal = document.getElementById('pollModal');
        if (pollModal) {
            document.getElementById('closePollModal')?.addEventListener('click', hidePollModal);
            document.getElementById('cancelPollBtn')?.addEventListener('click', hidePollModal);
            document.getElementById('createPollBtn')?.addEventListener('click', createPoll);
        }

        const eventModal = document.getElementById('eventModal');
        if (eventModal) {
            document.getElementById('closeEventModal')?.addEventListener('click', hideEventModal);
            document.getElementById('cancelEventBtn')?.addEventListener('click', hideEventModal);
            document.getElementById('createEventBtn')?.addEventListener('click', createEvent);
        }
    }

    // Calendar Page
    if (document.getElementById('calendarGrid')) {
        resetAllModalsAndSelections();
        await loadSchedule();
        await renderCalendar();
        loadMembersIntoDropdown();
        setupDayDetailsCloseButton();

        document.getElementById('prevMonth')?.addEventListener('click', () => { currentDate.setMonth(currentDate.getMonth()-1); renderCalendar(); });
        document.getElementById('nextMonth')?.addEventListener('click', () => { currentDate.setMonth(currentDate.getMonth()+1); renderCalendar(); });
        document.getElementById('todayBtn')?.addEventListener('click', () => { currentDate = new Date(); renderCalendar(); });
    }

    // Feed Page
    if (document.getElementById('feedContainer')) {
        setupImagePreview();
        await loadFeed('latest');
        subscribeToFeed();
    }

    // Events Page
    if (document.getElementById('eventsContainer')) {
        await loadUser();
        loadEventsPage();
        initEventsTabs();
    }

    // Golf Page
    if (document.getElementById('leaderboardBody')) {
        await loadGolfLeaderboard();
        subscribeToGolfLeaderboard();
    }

    // ====================== OVERTIME PAGE ======================
    if (document.getElementById('otLeaderboard')) {
        loadOTLeaderboard();
        loadOpenOTShifts();

        if (Notification.permission === "default") {
            Notification.requestPermission();
        }
    }

    initTabs();
    loadMemberChartDropdown();
});

// Expose global functions
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
