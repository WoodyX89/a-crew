// ================================================
// app.js - Complete Updated Version
// ================================================

const supabaseClient = supabase.createClient(
  'https://bwfwnpdjeovqeznwbckx.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ3ZnducGRqZW92cWV6bndiY2t4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYxOTI2NzIsImV4cCI6MjA5MTc2ODY3Mn0.QohjsfSgvw64ZwSLRCtr_4rh49JyInEmrpDdzrXISQU'
);

// ====================== 28-DAY ROTATION CONFIG ======================
const rotationCycle = 28;
const workingDaysInCycle = [
  false, false, true, true, true, true, true,
  false, false, false, false, false, true, true,
  true, true, false, false, false, false, false,
  true, true, true, true, true, false, false
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

// ====================== SELECTION (Mouse + Touch) ======================


async function showBulkShiftModal() {
    const memberName = prompt("Enter Member Name for all selected days:");
    if (!memberName) return clearSelection();

    const area = prompt("Enter Area (or type 'Floater'):");
    if (!area) return clearSelection();

    const status = confirm("Is this a Vacation?") ? "vacation" : "working";

    const inserts = selectedDays.map(dateStr => ({
        date: dateStr,
        member_name: memberName,
        area: area,
        status: status,
        is_floater: area.toLowerCase() === "floater"
    }));

    const { error } = await supabaseClient.from('schedule').insert(inserts);

    if (error) {
        alert("Failed to add shifts: " + error.message);
    } else {
        alert(`✅ Successfully added shift to ${selectedDays.length} days!`);
        await loadSchedule();
        renderCalendar();
    }

    clearSelection();
}

// ====================== BULK SHIFT MODAL FUNCTIONS ======================
// ====================== BULK SHIFT MODAL FUNCTIONS (with Vacation logic) ======================
function showBulkShiftModal() {
    const modal = document.getElementById('bulkShiftModal');
    const daysInfo = document.getElementById('bulkDaysInfo');
    
    daysInfo.textContent = `Applying shift to ${selectedDays.length} days`;
    
    // Populate members
    loadMembersIntoBulkDropdown();
    
    // Reset form
    document.getElementById('bulkShiftArea').innerHTML = '<option value="">Select Area...</option>';
    document.getElementById('bulkShiftStatus').value = 'working';
    
    // Show area group by default
    document.getElementById('bulkAreaGroup').style.display = 'block';
    
    modal.classList.add('active');
}

function hideBulkShiftModal() {
    document.getElementById('bulkShiftModal').classList.remove('active');
    clearSelection();
}
// Update area visibility when status changes
document.addEventListener('DOMContentLoaded', () => {
    const statusSelect = document.getElementById('bulkShiftStatus');
    if (statusSelect) {
        statusSelect.addEventListener('change', function() {
            const areaGroup = document.getElementById('bulkAreaGroup');
            if (this.value === 'vacation') {
                areaGroup.style.display = 'none';
            } else {
                areaGroup.style.display = 'block';
            }
        });
    }
});
// Hide/Show Area dropdown when Status changes in single Add Shift form
document.addEventListener('DOMContentLoaded', () => {
    const statusSelect = document.getElementById('shiftStatus');
    const areaGroup = document.getElementById('singleAreaGroup');

    if (statusSelect && areaGroup) {
        statusSelect.addEventListener('change', function() {
            areaGroup.style.display = (this.value === 'vacation') ? 'none' : 'block';
        });
    }
});

async function loadMembersIntoBulkDropdown() {
    const select = document.getElementById('bulkShiftMember');
    select.innerHTML = '<option value="">Select Member...</option>';

    const { data, error } = await supabaseClient
        .from('members')
        .select('*')
        .eq('status', 'Active')
        .order('full_name');

    if (error) return console.error(error);

    data.forEach(member => {
        const opt = document.createElement('option');
        opt.value = member.full_name;
        opt.textContent = member.full_name;
        opt.dataset.member = JSON.stringify(member);
        select.appendChild(opt);
    });

    // Auto-update area options when member changes
    select.addEventListener('change', updateBulkShiftAreas);
}

function updateBulkShiftAreas() {
    const memberSelect = document.getElementById('bulkShiftMember');
    const areaSelect = document.getElementById('bulkShiftArea');

    areaSelect.innerHTML = '<option value="">Select Area...</option>';

    const selectedOpt = memberSelect.options[memberSelect.selectedIndex];
    if (!selectedOpt || !selectedOpt.dataset.member) return;

    const member = JSON.parse(selectedOpt.dataset.member);

    // Supervisors only get Supervisor
    if (member.supervisor_status === 'Yes' || member.supervisor_status === 'Training') {
        const opt = document.createElement('option');
        opt.value = "Supervisor";
        opt.textContent = "Supervisor";
        areaSelect.appendChild(opt);
        return;
    }

    // Regular areas + Floater
    const areas = [];

    if (member.lh_status === 'Yes' || member.lh_status === 'Training') areas.push({value:"LH", text:"LH"});
    if (member.pt_status === 'Yes' || member.pt_status === 'Training') areas.push({value:"Pretreat", text:"PT (Pretreat)"});
    if (member.demin_status === 'Yes' || member.demin_status === 'Training') areas.push({value:"Demin", text:"Demin"});
    
    if (member.field_status === 'Yes' || member.field_status === 'Training') {
        areas.push({value:"Field 1", text:"Field 1"});
        areas.push({value:"Field 2", text:"Field 2"});
    }
    if (member.comp_status === 'Yes' || member.comp_status === 'Training') {
        areas.push({value:"Comp 1", text:"Comp 1"});
        areas.push({value:"Comp 2", text:"Comp 2"});
    }
    if (member.panel_status === 'Yes' || member.panel_status === 'Training') {
        areas.push({value:"Panel 1", text:"Panel 1"});
        areas.push({value:"Panel 2", text:"Panel 2"});
    }

    // Always add Floater
    areas.push({value:"Floater", text:"Float"});

    areas.forEach(a => {
        const opt = document.createElement('option');
        opt.value = a.value;
        opt.textContent = a.text;
        areaSelect.appendChild(opt);
    });
}

async function applyBulkShift() {
    const memberName = document.getElementById('bulkShiftMember').value.trim();
    const status = document.getElementById('bulkShiftStatus').value;
    let area = "";

    if (!memberName) return alert("Please select a member.");

    // Only require area if NOT on vacation
    if (status !== 'vacation') {
        area = document.getElementById('bulkShiftArea').value.trim();
        if (!area) return alert("Please select an area.");
    } else {
        area = "Vacation";   // Optional: you can store this in area field
    }

    const inserts = selectedDays.map(dateStr => ({
        date: dateStr,
        member_name: memberName,
        area: area,
        status: status,
        is_floater: area === "Floater"
    }));

    const { error } = await supabaseClient.from('schedule').insert(inserts);

    if (error) {
        alert("Failed to add shifts: " + error.message);
    } else {
        alert(`✅ Successfully added ${status === 'vacation' ? 'vacation' : 'shift'} to ${selectedDays.length} days!`);
        hideBulkShiftModal();
        await loadSchedule();
        await renderCalendar();
    }
}4

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

  let html = `
    <div class="post-header">
      <strong>${post.full_name || 'Crew Member'}</strong> • ${new Date(post.created_at).toLocaleString()}
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

  // Event
  if (post.post_type === 'event' && post.event_title) {
    html += `
      <div class="event">
        <strong>📅 ${post.event_title}</strong><br>
        When: ${new Date(post.event_date).toLocaleString()}<br>
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
    if (!currentUser) {
        return alert("You must be logged in to see who liked this post.");
    }

    try {
        // Step 1: Get all likes for this post
        const { data: likesData, error: likesError } = await supabaseClient
            .from('post_likes')
            .select('user_id')
            .eq('post_id', postId);

        if (likesError) throw likesError;
        if (!likesData || likesData.length === 0) {
            return alert("No one has liked this post yet.");
        }

        // Step 2: Get the full names from members table using the user_ids
        const userIds = likesData.map(like => like.user_id);

        const { data: membersData, error: membersError } = await supabaseClient
            .from('members')
            .select('full_name')
            .in('id', userIds);

        if (membersError) throw membersError;

        // Build the list of names
        const names = membersData
            .map(member => member.full_name || "Unknown Crew Member")
            .filter(name => name.trim() !== "")
            .join("\n• ");

        if (names) {
            alert(`❤️ Liked by:\n\n• ${names}`);
        } else {
            alert(`This post has ${likesData.length} like(s), but names could not be loaded.`);
        }

    } catch (err) {
        console.error("Likers error:", err);
        alert("Could not load likers.\n\nCheck browser console (F12) for details.");
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

// ====================== CREATE EVENT ======================
async function createEvent() {
  if (!currentUser) {
    return alert("You must be logged in to schedule events.");
  }

  const title       = document.getElementById('eventTitle').value.trim();
  const dateInput   = document.getElementById('eventDate').value;
  const location    = document.getElementById('eventLocation').value.trim();
  const description = document.getElementById('eventDesc').value.trim();

  if (!title)     return alert("Event title is required.");
  if (!dateInput) return alert("Please select a date and time.");

  const eventDate = new Date(dateInput);
  if (isNaN(eventDate.getTime())) {
    return alert("Invalid date and time selected.");
  }

  const displayName = await getCurrentUserFullName();

  const { error } = await supabaseClient.from('posts').insert({
    user_id: currentUser.id,
    full_name: displayName,                    // ← Full name
    content: description || null,
    post_type: 'event',
    event_title: title,
    event_date: eventDate.toISOString(),
    event_location: location || null,
    event_description: description || null,
    likes: 0
  });

  if (error) {
    console.error(error);
    alert("Failed to schedule event: " + error.message);
  } else {
    hideEventModal();
    alert("✅ Event scheduled successfully!");

    if (document.getElementById('feedContainer')) {
      loadFeed(currentSort);
    }
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

// Replace your current loadUser() with this:
async function loadUser() {
  try {
    const { data: { user }, error } = await supabaseClient.auth.getUser();
    if (error || !user) {
      console.error("Auth error:", error);
      currentUser = null;
      return;
    }

    currentUser = user;
    console.log("✅ Current user loaded successfully:", currentUser.id, currentUser.email);

  } catch (err) {
    console.error("Error loading user:", err);
    currentUser = null;
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

// ====================== RENDER CALENDAR - LOCKED SELECTION ======================
async function renderCalendar() {
    const grid = document.getElementById('calendarGrid');
    if (!grid) return;

    grid.innerHTML = '';
    selectedDays = [];
    multiSelectActive = false;

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

        // Click / Tap handling
        dayEl.addEventListener('click', (e) => handleDayClick(e, dayEl));

        // Drag / Touch start
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

// ====================== DRAG / TOUCH START ======================
function startDrag(e, dayEl) {
    isDragging = true;
    if (!multiSelectActive) {
        selectedDays = [];
        multiSelectActive = true;
    }

    toggleDaySelection(dayEl);   // Always add, never remove during drag

    const moveHandler = (moveEvent) => onDragMove(moveEvent);
    const endHandler = () => endDrag(moveHandler, endHandler);

    document.addEventListener('mousemove', moveHandler);
    document.addEventListener('mouseup', endHandler);
    document.addEventListener('touchmove', moveHandler, { passive: false });
    document.addEventListener('touchend', endHandler);
}

function onDragMove(e) {
    if (!isDragging) return;
    if (e.preventDefault) e.preventDefault();

    let clientX = e.clientX || (e.touches && e.touches[0].clientX);
    let clientY = e.clientY || (e.touches && e.touches[0].clientY);

    const element = document.elementFromPoint(clientX, clientY);
    
    if (element && element.classList.contains('calendar-day') && element.dataset.date) {
        toggleDaySelection(element);   // Only add, never remove
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

// ====================== SHOW DAY DETAILS (Fixed - Delete X restored) ======================
function showDayDetails(dateStr) {
    const detailsPanel = document.getElementById('dayDetails');
    const dateTitle = document.getElementById('selectedDate');
    const list = document.getElementById('scheduleList');

    const displayDate = new Date(dateStr + 'T00:00:00');
    const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/Denver',
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric'
    });

    dateTitle.textContent = formatter.format(displayDate);
    dateTitle.dataset.date = dateStr;

    list.innerHTML = '';

    const shifts = scheduleData[dateStr] || [];
    const events = eventsThisMonth[dateStr] || [];

    // Show Events
    if (events.length > 0) {
        const eventsHeader = document.createElement('h4');
        eventsHeader.textContent = 'Events';
        eventsHeader.style.margin = '15px 0 8px 0';
        eventsHeader.style.color = '#eab308';
        list.appendChild(eventsHeader);

        events.forEach(event => {
            const item = document.createElement('div');
            item.className = 'shift-item event-item';
            item.style.position = 'relative';
            item.innerHTML = `
                <strong>📅 ${event.event_title}</strong><br>
                <small>${new Date(event.event_date).toLocaleString([], { 
                    hour: 'numeric', 
                    minute: '2-digit' 
                })}</small>
            `;
            list.appendChild(item);
        });
    }

    // Show Manual Shifts with Delete X button
    if (shifts.length > 0) {
        const shiftsHeader = document.createElement('h4');
        shiftsHeader.textContent = 'Shifts';
        shiftsHeader.style.margin = '15px 0 8px 0';
        list.appendChild(shiftsHeader);

        shifts.forEach(shift => {
            const item = document.createElement('div');
            item.className = `shift-item ${shift.status}`;
            item.style.position = 'relative';   // Important for X button

            const areaText = shift.is_floater ? 
                '<strong style="color:#f59e0b;">Float</strong>' : 
                `Area: ${shift.area || 'Not specified'}`;

            item.innerHTML = `
                <strong>${shift.name}</strong><br>
                ${areaText}
            `;

            // Restore Delete "X" button
            const deleteX = document.createElement('button');
            deleteX.className = 'shift-delete-x';
            deleteX.innerHTML = '✕';
            deleteX.title = 'Delete shift';
            deleteX.onclick = (e) => {
                e.stopPropagation();
                deleteShift(shift.id, dateStr);
            };

            item.appendChild(deleteX);
            list.appendChild(item);
        });
    }

    // Empty state
    if (shifts.length === 0 && events.length === 0) {
        list.innerHTML = `<p style="color:#9ca3af; font-style:italic;">No shifts or events scheduled for this day.</p>`;
    }

    detailsPanel.classList.add('open');
}

function setupDayDetailsCloseButton() {
  const closeBtn = document.getElementById('closeDetails');
  if (closeBtn) closeBtn.addEventListener('click', () => document.getElementById('dayDetails').classList.remove('open'));
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
}

async function updateShift(shiftId, dateStr) {
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
        showDayDetails(dateStr);   // Refresh the panel
    }
}

async function deleteShift(shiftId, dateStr) {
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
        showDayDetails(dateStr);   // Refresh the panel
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
let golfChannel = null;
let autoRefreshInterval = null;

async function loadGolfLeaderboard() {
    const tbody = document.getElementById('leaderboardBody');
    if (!tbody) {
        console.error("❌ leaderboardBody not found in DOM");
        return;
    }

    tbody.innerHTML = `
        <tr>
          <td colspan="7" style="text-align:center; padding:60px; color:#00C7B2;">
            <i class="fas fa-spinner fa-spin"></i><br><br>Loading leaderboard...
          </td>
        </tr>`;

    console.log("🔄 Starting loadGolfLeaderboard at", new Date().toLocaleTimeString());

    try {
        const { data, error } = await supabaseClient
            .from('golf_teams')
            .select('*')
            .order('score', { ascending: true });

        console.log("📊 Supabase response:", { 
            rows: data ? data.length : 0, 
            firstRow: data && data.length > 0 ? data[0] : null,
            error: error 
        });

        if (error) throw error;

        tbody.innerHTML = '';

        if (!data || data.length === 0) {
            console.warn("⚠️ No teams returned");
            tbody.innerHTML = `
                <tr>
                  <td colspan="7" style="text-align:center; padding:80px; color:#9ca3af;">
                    No teams found.<br><br>
                    <button onclick="showAddTeamModal()" class="add-team-btn">
                        <i class="fas fa-plus"></i> Add First Team
                    </button>
                  </td>
                </tr>`;
            return;
        }

        console.log(`✅ Successfully loaded ${data.length} teams`);

        // Build the table rows
        data.forEach((team, index) => {
            const toPar = team.score || 0;
            const toParText = toPar < 0 ? toPar : toPar === 0 ? 'E' : `+${toPar}`;
            const toParClass = toPar < 0 ? 'topar-under' : toPar === 0 ? 'topar-even' : 'topar-over';

            const row = document.createElement('tr');
            row.innerHTML = `
                <td style="font-weight:700; font-size:20px; color:#00C7B2; text-align:center;">${index + 1}</td>
                <td style="font-weight:600; text-align:left; padding-left:12px;">${team.team_name || 'Unnamed Team'}</td>
                <td style="color:#9ca3af; font-size:14.5px; text-align:left;">${team.players || '—'}</td>
                <td style="font-weight:700; font-size:20px; color:#00C7B2; text-align:center;">${team.score || 0}</td>
                <td style="font-weight:500; text-align:center;">${team.thru || 'F'}</td>
                <td class="${toParClass}" style="font-weight:700; font-size:19px; text-align:center;">${toParText}</td>
                <td style="text-align:center;">
                    <button onclick="editTeam('${team.id}')" style="background:none;border:none;color:#00C7B2;font-size:20px;cursor:pointer;">✏️</button>
                </td>
            `;
            tbody.appendChild(row);
        });

        // Update last updated with live timer
        updateLastUpdatedTime();

    } catch (err) {
        console.error("❌ Load error:", err);
        tbody.innerHTML = `<tr><td colspan="7" style="padding:40px; color:#ef4444; text-align:center;">Error loading data</td></tr>`;
    }
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

// ====================== MAIN INITIALIZATION ======================
document.addEventListener('DOMContentLoaded', async () => {
  fetch('navbar.html')
      .then(response => response.text())
      .then(data => {
        const placeholder = document.getElementById('navbar-placeholder');
        if (placeholder) placeholder.innerHTML = data;
        setTimeout(initMobileMenu, 100);
      })
      .catch(err => console.error('Error loading navbar:', err));

  // ====================== MEMBERS PAGE SETUP ======================
  if (document.getElementById('membersBody') || document.getElementById('membersList')) {
    await loadUser();

    if (!currentUser) {
      alert("Please log in to manage members.");
      return;
    }

    loadMembers();

    const addMemberBtn = document.getElementById('addMemberBtn');
    if (addMemberBtn) addMemberBtn.addEventListener('click', () => openMemberModal());

    const closeModalBtn = document.getElementById('closeModal');
    const cancelBtn = document.getElementById('cancelBtn');
    const memberForm = document.getElementById('memberForm');

    if (closeModalBtn) closeModalBtn.addEventListener('click', () => document.getElementById('memberModal').classList.remove('active'));
    if (cancelBtn) cancelBtn.addEventListener('click', () => document.getElementById('memberModal').classList.remove('active'));
    if (memberForm) memberForm.addEventListener('submit', saveMember);
  }

// ====================== FEED PAGE SETUP ======================
if (document.getElementById('feedContainer')) {
  await loadUser();
  setupImagePreview();
  await loadFeed('latest');
  subscribeToFeed();


    // === POLL MODAL LISTENERS - MOVED HERE ===
    const pollModal = document.getElementById('pollModal');
    if (pollModal) {
      const closePollModal = document.getElementById('closePollModal');
      const cancelPollBtn = document.getElementById('cancelPollBtn');
      const createPollBtn = document.getElementById('createPollBtn');
      const addPollOptionBtn = document.getElementById('addPollOptionBtn');

      if (closePollModal) closePollModal.addEventListener('click', hidePollModal);
      if (cancelPollBtn) cancelPollBtn.addEventListener('click', hidePollModal);
      if (createPollBtn) createPollBtn.addEventListener('click', createPoll);
      if (addPollOptionBtn) addPollOptionBtn.addEventListener('click', addPollOption);
    }

    // Event Modal Listeners
// ====================== EVENT MODAL LISTENERS ======================
const eventModal = document.getElementById('eventModal');
if (eventModal) {
  const closeEventModal = document.getElementById('closeEventModal');
  const cancelEventBtn  = document.getElementById('cancelEventBtn');
  const createEventBtn  = document.getElementById('createEventBtn');

  if (closeEventModal) closeEventModal.addEventListener('click', hideEventModal);
  if (cancelEventBtn)  cancelEventBtn.addEventListener('click', hideEventModal);
  if (createEventBtn)  createEventBtn.addEventListener('click', createEvent);
}
  }
  // ====================== GOLF LEADERBOARD PAGE SETUP (Fixed - Independent) ======================
if (document.getElementById('leaderboardBody')) {
    console.log("✅ Golf leaderboard page detected - initializing...");

    await loadUser();

    // Give DOM time to load the table
    setTimeout(async () => {
        console.log("🔄 Calling loadGolfLeaderboard from golf.html");
        await loadGolfLeaderboard();
        subscribeToGolfLeaderboard();

        // Auto-refresh every 15 seconds
        if (!autoRefreshInterval) {
            autoRefreshInterval = setInterval(() => {
                loadGolfLeaderboard();
            }, 30000);
        }
    }, 300);

}

  // ====================== CALENDAR PAGE SETUP ======================
  if (document.getElementById('calendarGrid')) {
    await loadSchedule();
    await renderCalendar();
    loadMembersIntoDropdown();
    setupDayDetailsCloseButton();

    document.getElementById('prevMonth').addEventListener('click', () => {
      currentDate.setMonth(currentDate.getMonth() - 1);
      renderCalendar();
    });
    document.getElementById('nextMonth').addEventListener('click', () => {
      currentDate.setMonth(currentDate.getMonth() + 1);
      renderCalendar();
    });
    document.getElementById('todayBtn').addEventListener('click', () => {
      currentDate = new Date();
      renderCalendar();
    });
  }
});

// ================================================
// GOLF PAGE GLOBAL FUNCTIONS (Must be outside DOMContentLoaded)
// ================================================

function showAddTeamModal() {
    const modal = document.getElementById('teamModal');
    if (!modal) return console.error("Team modal not found on this page");
    
    modal.style.display = 'flex';
    document.getElementById('modalTeamTitle').textContent = 'Add New Team';
    document.getElementById('teamId').value = '';
    document.getElementById('teamName').value = '';
    document.getElementById('teamPlayers').value = '';
    document.getElementById('teamScore').value = '0';
    document.getElementById('teamThru').value = 'F';
}

function hideTeamModal() {
    const modal = document.getElementById('teamModal');
    if (modal) modal.style.display = 'none';
}

async function saveTeam() {
    const id = document.getElementById('teamId').value.trim();
    const teamData = {
        team_name: document.getElementById('teamName').value.trim(),
        players: document.getElementById('teamPlayers').value.trim(),
        score: parseInt(document.getElementById('teamScore').value) || 0,
        thru: document.getElementById('teamThru').value.trim() || 'F',
        updated_at: new Date().toISOString()
    };

    if (!teamData.team_name) {
        return alert("Team name is required!");
    }

    try {
        let error;
        if (id) {
            ({ error } = await supabaseClient.from('golf_teams').update(teamData).eq('id', id));
        } else {
            ({ error } = await supabaseClient.from('golf_teams').insert([teamData]));
        }

        if (error) throw error;

        hideTeamModal();
        await loadGolfLeaderboard();
        console.log("✅ Team saved successfully");
    } catch (err) {
        console.error(err);
        alert("Error saving team: " + (err.message || err));
    }
}

async function editTeam(id) {
    try {
        const { data, error } = await supabaseClient
            .from('golf_teams')
            .select('*')
            .eq('id', id)
            .single();

        if (error || !data) throw error || new Error("Team not found");

        const modal = document.getElementById('teamModal');
        modal.style.display = 'flex';
        document.getElementById('modalTeamTitle').textContent = 'Edit Team';
        document.getElementById('teamId').value = data.id;
        document.getElementById('teamName').value = data.team_name || '';
        document.getElementById('teamPlayers').value = data.players || '';
        document.getElementById('teamScore').value = data.score || 0;
        document.getElementById('teamThru').value = data.thru || 'F';
    } catch (err) {
        console.error(err);
        alert("Failed to load team for editing");
    }
}

// Expose to onclick handlers in HTML
window.showAddTeamModal = showAddTeamModal;
window.hideTeamModal = hideTeamModal;
window.saveTeam = saveTeam;
window.editTeam = editTeam;

let lastUpdatedTimestamp = null;

function updateLastUpdatedTime() {
    const el = document.getElementById('last-updated');
    if (!el) return;

    lastUpdatedTimestamp = Date.now();

    function tick() {
        if (!lastUpdatedTimestamp) return;
        const secondsAgo = Math.floor((Date.now() - lastUpdatedTimestamp) / 1000);
        
        if (secondsAgo < 5) {
            el.textContent = `Last updated: Just now`;
        } else if (secondsAgo < 60) {
            el.textContent = `Last updated: ${secondsAgo}s ago`;
        } else {
            const minutesAgo = Math.floor(secondsAgo / 60);
            el.textContent = `Last updated: ${minutesAgo}m ago`;
        }
    }

    tick(); // initial call
    // Update every 10 seconds
    setInterval(tick, 10000);
}