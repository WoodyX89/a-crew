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

function renderPost(post) {
  const container = document.getElementById('feedContainer');
  if (!container) return;

  const postEl = document.createElement('div');
  postEl.className = 'card';
  postEl.style.marginBottom = '20px';
  const postId = post.id;

  let html = `
    <div class="post-header">
      <strong>${post.full_name || 'Crew Member'}</strong> • ${new Date(post.created_at).toLocaleString()}
    </div>
  `;

  if (post.post_type !== 'poll' && post.content) {
    html += `<div class="post-content">${post.content}</div>`;
  }

  // ==================== IMPROVED IMAGE HANDLING ====================
  let imageArray = [];

  if (post.image_urls) {
    if (Array.isArray(post.image_urls)) {
      imageArray = post.image_urls;
    } else if (typeof post.image_urls === 'string') {
      try {
        imageArray = JSON.parse(post.image_urls);
      } catch (e) {
        imageArray = [post.image_urls];
      }
    }
  }

  if (imageArray.length > 0) {
    html += `<div class="post-images">`;
    imageArray.forEach(url => {
      if (url) {
        const cacheBusterUrl = url + (url.includes('?') ? '&' : '?') + 't=' + Date.now();
        html += `<img src="${cacheBusterUrl}"
                     alt="post image"
                     loading="lazy"
                     onerror="console.error('Image failed to load:', '${url}'); this.style.display='none';"
                     style="max-width:100%; border-radius:12px; margin:10px 0; display:block;">`;
      }
    });
    html += `</div>`;
  }
  // ================================================================

  if (post.post_type === 'poll' && Array.isArray(post.poll_options)) {
    html += `<div class="poll"><strong>${post.content || 'Poll Question'}</strong>`;
    const totalVotes = Object.values(post.poll_votes || {}).reduce((a, b) => a + b, 0);
    post.poll_options.forEach((option) => {
      const votes = (post.poll_votes && post.poll_votes[option]) || 0;
      const percentage = totalVotes > 0 ? Math.round((votes / totalVotes) * 100) : 0;
      html += `
        <div class="poll-option" onclick="voteOnPoll('${post.id}', '${option}')">
          ${option} <span class="poll-votes">${votes} votes (${percentage}%)</span>
        </div>`;
    });
    html += `</div>`;
  }

  if (post.post_type === 'event' && post.event_title) {
    html += `
      <div class="event">
        <strong>📅 ${post.event_title}</strong><br>
        When: ${new Date(post.event_date).toLocaleString()}<br>
        ${post.event_location ? `Where: ${post.event_location}<br>` : ''}
        ${post.event_description ? post.event_description : ''}
      </div>`;
  }

  html += `
    <div class="post-actions">
      <button onclick="toggleLike('${postId}')" id="like-btn-${postId}" class="action-btn like-btn">
        ❤️ <span id="like-count-${postId}">${post.likes || 0}</span>
      </button>
      <button onclick="toggleCommentBox('${postId}')" class="action-btn comment-btn">
        💬 Comment
      </button>
    </div>
    <div id="comment-box-${postId}" class="comment-box" style="display:none;">
      <input type="text" id="comment-input-${postId}" placeholder="Write a comment...">
      <button onclick="addComment('${postId}')">Post</button>
      <button onclick="toggleCommentBox('${postId}')">Cancel</button>
    </div>
    <div id="comments-${postId}" class="comments"></div>
  `;

  postEl.innerHTML = html;
  container.prepend(postEl);
  loadCommentsForPost(postId);
}   // ←←← THIS IS THE IMPORTANT CLOSING BRACE

function subscribeToFeed() {
  if (feedChannel) return;   // prevent duplicate subscriptions

  feedChannel = supabaseClient.channel('crew-feed')
    .on('postgres_changes', { 
      event: 'INSERT', 
      schema: 'public', 
      table: 'posts' 
    }, (payload) => renderPost(payload.new))
    .on('postgres_changes', { 
      event: 'INSERT', 
      schema: 'public', 
      table: 'comments' 
    }, (payload) => loadCommentsForPost(payload.new.post_id))
    .subscribe((status) => {
      console.log('Realtime subscription status:', status);
    });
}

// ====================== MOBILE MENU ======================
function initMobileMenu() {
  const hamburger = document.getElementById('hamburger');
  const mobileMenu = document.getElementById('mobileMenu');
  const closeMenu = document.getElementById('closeMenu');
  const mobileLinks = document.querySelectorAll('.mobile-link');
  if (!hamburger || !mobileMenu || !closeMenu) return;

  hamburger.addEventListener('click', () => mobileMenu.classList.add('active'));
  closeMenu.addEventListener('click', () => mobileMenu.classList.remove('active'));
  mobileLinks.forEach(link => link.addEventListener('click', () => mobileMenu.classList.remove('active')));
}

// ====================== MEMBERS FUNCTIONS ======================
async function loadMembers() {
  const tbody = document.getElementById('membersBody');
  const listContainer = document.getElementById('membersList');
  if (!tbody && !listContainer) return;

  const { data, error } = await supabaseClient
    .from('members')
    .select('*')
    .order('joined_date', { ascending: false });

  if (tbody) tbody.innerHTML = '';
  if (listContainer) listContainer.innerHTML = '';

  if (error) {
    console.error(error);
    if (tbody) tbody.innerHTML = `Error loading members`;
    return;
  }
  if (!data || data.length === 0) {
    if (tbody) tbody.innerHTML = `No members found yet.`;
    if (listContainer) listContainer.innerHTML = `<p>No members found yet.</p>`;
    return;
  }

  data.forEach(member => {
    if (tbody) {
      const row = document.createElement('tr');
      row.innerHTML = `
        <td>${member.full_name || 'N/A'}</td>
        <td>${member.email || 'N/A'}</td>
        <td>${member.phone || 'N/A'}</td>
        <td>${member.role || 'Member'}</td>
        <td>${member.status || 'Active'}</td>
        <td>${new Date(member.joined_date).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}</td>
        <td>
          <button class="edit-btn" data-id="${member.id}">Edit</button>
          <button class="delete-btn" data-id="${member.id}">Delete</button>
        </td>`;
      tbody.appendChild(row);
    }
  });

  if (listContainer) {
    data.forEach(member => {
      const card = document.createElement('div');
      card.className = 'member-card';
      card.innerHTML = `
        <h3>${member.full_name || 'N/A'}</h3>
        <p><strong>Email:</strong> ${member.email || 'N/A'}</p>
        <p><strong>Phone:</strong> ${member.phone || 'N/A'}</p>
        <p><strong>Role:</strong> ${member.role || 'Member'}</p>
        <p><strong>Status:</strong> ${member.status || 'Active'}</p>
        <p><strong>Joined:</strong> ${new Date(member.joined_date).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}</p>
        <button class="edit-btn" data-id="${member.id}">Edit</button>
        <button class="delete-btn" data-id="${member.id}">Delete</button>`;
      listContainer.appendChild(card);
    });
  }
  addActionListeners();
}



function addActionListeners() {
  document.querySelectorAll('.edit-btn').forEach(btn => 
    btn.addEventListener('click', () => editMember(btn.dataset.id))
  );
  document.querySelectorAll('.delete-btn').forEach(btn => 
    btn.addEventListener('click', () => deleteMember(btn.dataset.id))
  );
}


async function loadFeed(sortBy = 'latest') {
  currentSort = sortBy;
  const container = document.getElementById('feedContainer');
  if (!container) return;
  container.innerHTML = '<p>Loading feed...</p>';

  let query = supabaseClient.from('posts').select('*');
  if (sortBy === 'latest') query = query.order('created_at', { ascending: true });
  else if (sortBy === 'popular') query = query.order('likes', { ascending: false });

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
  data.forEach(renderPost);
}

async function toggleLike(postId) {
  const { data: current } = await supabaseClient.from('posts').select('likes').eq('id', postId).single();
  const newLikes = (current?.likes || 0) + 1;

  const { error } = await supabaseClient.from('posts').update({ likes: newLikes }).eq('id', postId);
  if (!error) {
    const countEl = document.getElementById(`like-count-${postId}`);
    if (countEl) {
      countEl.textContent = newLikes;
      countEl.classList.add('like-pop');
      setTimeout(() => countEl.classList.remove('like-pop'), 600);
    }
  }
}

async function loadCommentsForPost(postId) {
  const { data, error } = await supabaseClient
    .from('comments')
    .select('*')
    .eq('post_id', postId)
    .order('created_at', { ascending: true });

  if (error) return console.error(error);

  const container = document.getElementById(`comments-${postId}`);
  if (!container) return;

  container.innerHTML = data.length === 0 ? `<p>No comments yet.</p>` : '';
  data.forEach(comment => {
    const div = document.createElement('div');
    div.innerHTML = `<strong>${comment.full_name}</strong> <small>${new Date(comment.created_at).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</small><br>${comment.content}`;
    container.appendChild(div);
  });
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
  const content = input.value.trim();
  if (!content || !currentUser) return;

  const { error } = await supabaseClient.from('comments').insert({
    post_id: postId,
    user_id: currentUser.id,
    full_name: currentUser.email ? currentUser.email.split('@')[0] : 'Crew Member',
    content: content
  });

  if (!error) {
    input.value = '';
    loadCommentsForPost(postId);
  }
}

function toggleCommentBox(postId) {
  const box = document.getElementById(`comment-box-${postId}`);
  box.style.display = box.style.display === 'none' ? 'block' : 'none';
}

// ====================== OTHER FUNCTIONS (unchanged) ======================
function showPollModal() {
  pollOptions = ["", ""];
  document.getElementById('pollModal').style.display = 'flex';
  renderPollOptions();
}

function hidePollModal() {
  document.getElementById('pollModal').style.display = 'none';
}

function renderPollOptions() {
  const container = document.getElementById('pollOptionsContainer');
  container.innerHTML = '';
  pollOptions.forEach((option, index) => {
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'pollOption';
    input.placeholder = `Option ${index + 1}`;
    input.value = option;
    input.addEventListener('input', () => { pollOptions[index] = input.value.trim(); });
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

  const { error } = await supabaseClient.from('posts').insert({
    user_id: currentUser.id,
    full_name: currentUser.email ? currentUser.email.split('@')[0] : 'Crew Member',
    content: question,
    post_type: 'poll',
    poll_options: validOptions,
    poll_votes: {},
    likes: 0
  });

  if (error) alert("Failed to create poll: " + error.message);
  else {
    hidePollModal();
    document.getElementById('pollQuestion').value = '';
    alert("✅ Poll posted successfully!");
    loadFeed(currentSort);
  }
}

function showEventModal() {
  document.getElementById('eventModal').style.display = 'flex';
}

function hideEventModal() {
  document.getElementById('eventModal').style.display = 'none';
}

async function createEvent() {
  if (!currentUser) return alert("You must be logged in.");
  const title = document.getElementById('eventTitle').value.trim();
  const dateStr = document.getElementById('eventDate').value;
  const location = document.getElementById('eventLocation').value.trim();
  const description = document.getElementById('eventDesc').value.trim();

  if (!title) return alert("Event title is required.");
  if (!dateStr) return alert("Please select a date and time.");

  const eventDate = new Date(dateStr);

  const { error } = await supabaseClient.from('posts').insert({
    user_id: currentUser.id,
    full_name: currentUser.email ? currentUser.email.split('@')[0] : 'Crew Member',
    content: description || null,
    post_type: 'event',
    event_title: title,
    event_date: eventDate.toISOString(),
    event_location: location || null,
    event_description: description || null,
    likes: 0
  });

  if (error) alert("Failed to create event: " + error.message);
  else {
    hideEventModal();
    document.getElementById('eventTitle').value = '';
    document.getElementById('eventDate').value = '';
    document.getElementById('eventLocation').value = '';
    document.getElementById('eventDesc').value = '';
    alert("✅ Event scheduled successfully!");
    loadFeed(currentSort);
  }
}

function openMemberModal(member = null) {
  const modal = document.getElementById('memberModal');
  const form = document.getElementById('memberForm');
  const title = document.getElementById('modalTitle');
  form.reset();
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
  } else {
    title.textContent = 'Add New Member';
    currentEditingId = null;
  }
  modal.classList.add('active');
}

async function saveMember(e) {
  e.preventDefault();
  const memberData = {
    full_name: document.getElementById('fullName').value.trim(),
    email: document.getElementById('email').value.trim(),
    phone: document.getElementById('phone').value.trim(),
    role: document.getElementById('role').value,
    status: document.getElementById('status').value,
    joined_date: currentEditingId ? undefined : new Date().toISOString()
  };

  let error;
  if (currentEditingId) {
    ({ error } = await supabaseClient.from('members').update(memberData).eq('id', currentEditingId));
  } else {
    ({ error } = await supabaseClient.from('members').insert([memberData]));
  }

  if (error) {
    alert('Error saving member: ' + error.message);
    return;
  }
  document.getElementById('memberModal').classList.remove('active');
  loadMembers();
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

async function loadUser() {
  try {
    const { data: { user } } = await supabaseClient.auth.getUser();
    currentUser = user;
    if (user && document.getElementById('fullName')) {
      document.getElementById('fullName').textContent = user.email ? user.email.split('@')[0] : "Crew Member";
    }
  } catch (err) {
    console.error("Error loading user:", err);
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

async function createTextPost() {
  if (!currentUser) return alert("You must be logged in to post.");

  const content = document.getElementById('postContent').value.trim();
  const imageUrls = [];

  if (selectedFiles.length > 0) {
    for (let file of selectedFiles) {
      const fileName = `${Date.now()}-${Math.random().toString(36).slice(2)}.${file.name.split('.').pop()}`;

      const { error: uploadError } = await supabaseClient.storage
        .from('post-images')
        .upload(fileName, file, { 
          cacheControl: '3600', 
          upsert: false 
        });

      if (uploadError) {
        console.error("Upload error:", uploadError);
        alert("Image upload failed: " + uploadError.message);
        return;
      }

      const { data: urlData } = supabaseClient.storage
        .from('post-images')
        .getPublicUrl(fileName);

      if (urlData?.publicUrl) {
        imageUrls.push(urlData.publicUrl);
        console.log("✅ Image uploaded successfully:", urlData.publicUrl);
      } else {
        alert("Failed to generate public URL.");
        return;
      }
    }
  }

  const { error } = await supabaseClient.from('posts').insert({
    user_id: currentUser.id,
    full_name: currentUser.email ? currentUser.email.split('@')[0] : 'Crew Member',
    content: content || null,
    post_type: 'text',
    image_urls: imageUrls.length ? imageUrls : null,
    likes: 0
  });

  if (error) {
    alert("Post failed: " + error.message);
  } else {
    document.getElementById('postContent').value = '';
    document.getElementById('imageUpload').value = '';
    document.getElementById('imagePreview').innerHTML = '';
    selectedFiles = [];
    alert("Post shared successfully!");
    loadFeed(currentSort);
  }
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

function renderCalendar() {
  const grid = document.getElementById('calendarGrid');
  if (!grid) return;
  grid.innerHTML = '';
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  document.getElementById('monthYear').textContent = currentDate.toLocaleString('default', { month: 'long', year: 'numeric' });

  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  for (let i = firstDay - 1; i >= 0; i--) grid.appendChild(createDayElement(0, true));
  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
    grid.appendChild(createDayElement(day, false, dateStr));
  }
  const remaining = 42 - (firstDay + daysInMonth);
  for (let day = 1; day <= remaining; day++) grid.appendChild(createDayElement(day, true));
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

  if (shifts.length === 0) {
    list.innerHTML = `<p>No manual shifts scheduled for this day.</p>`;
  } else {
    shifts.forEach(shift => {
      const item = document.createElement('div');
      item.className = `shift-item ${shift.status}`;
      item.innerHTML = `<strong>${shift.name}</strong><br>${shift.status === 'vacation' ? 'On Vacation' : `Area: ${shift.area || 'Not specified'}`}`;
      list.appendChild(item);
    });
  }
  detailsPanel.classList.add('open');
}

function setupDayDetailsCloseButton() {
  const closeBtn = document.getElementById('closeDetails');
  if (closeBtn) closeBtn.addEventListener('click', () => document.getElementById('dayDetails').classList.remove('open'));
}

async function loadMembersIntoDropdown() {
  const select = document.getElementById('shiftMember');
  if (!select) return;

  const { data, error } = await supabaseClient.from('members').select('full_name').order('full_name');
  if (error) return console.error(error);

  select.innerHTML = '<option value="">Select Member...</option>';
  data.forEach(member => {
    const option = document.createElement('option');
    option.value = member.full_name;
    option.textContent = member.full_name;
    select.appendChild(option);
  });
}

async function addShift() {
  const dateStr = document.getElementById('selectedDate').dataset.date;
  const memberName = document.getElementById('shiftMember').value.trim();
  const area = document.getElementById('shiftArea').value.trim();
  const status = document.getElementById('shiftStatus').value;

  if (!dateStr) return alert("Please select a date first.");
  if (!memberName) return alert("Please select a member.");
  if (!area) return alert("Please select an area.");

  const { error } = await supabaseClient.from('schedule').insert([{ date: dateStr, member_name: memberName, area: area, status: status }]);
  if (error) alert("Failed to save shift: " + error.message);
  else {
    document.getElementById('shiftMember').value = '';
    document.getElementById('shiftArea').value = '';
    await loadSchedule();
    showDayDetails(dateStr);
    alert("Shift added successfully!");
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

  if (document.getElementById('membersBody') || document.getElementById('membersList')) {
    loadMembers();
  }

  if (document.getElementById('feedContainer')) {
  await loadUser();
  setupImagePreview();
  await loadFeed('latest');
  subscribeToFeed();        // ← This line was causing the error
}

  if (document.getElementById('calendarGrid')) {
    await loadSchedule();
    renderCalendar();
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