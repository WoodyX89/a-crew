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
  const totalVotes = Object.values(post.poll_votes || {}).reduce((a, b) => a + b, 0);
  const hasVoted = post.user_votes && post.user_votes[currentUser?.id];

  html += `
  <div class="poll">
    <strong>${post.content || 'Poll Question'}</strong>
    <div class="poll-total">Total votes: ${totalVotes}</div>`;

  post.poll_options.forEach((option) => {
    const votes = (post.poll_votes && post.poll_votes[option]) || 0;
    const percentage = totalVotes > 0 ? Math.round((votes / totalVotes) * 100) : 0;
    const isSelected = hasVoted === option;

    html += `
      <div class="poll-option ${isSelected ? 'voted' : ''}" 
           onclick="${!hasVoted ? `voteOnPoll('${post.id}', '${option}')` : ''}">
        
        <div class="poll-option-header">
          <span class="poll-text">${option}</span>
          ${isSelected ? `<span class="your-vote">✓ Your vote</span>` : ''}
        </div>
        
        <div class="progress-container">
          <div class="progress-bar" style="width: ${percentage}%"></div>
        </div>
        
        <div class="poll-stats">
          <span class="poll-percentage">${percentage}%</span>
          <span class="poll-votes">${votes} votes</span>
        </div>
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
      <input type="text" 
        id="comment-input-${postId}" 
        placeholder="Write a comment...">
  
    <div style="display: flex; gap: 10px;">
      <button onclick="addComment('${postId}')">Post Comment</button>
      <button onclick="toggleCommentBox('${postId}')">Cancel</button>
    </div>
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

  if (error) {
    console.error(error);
    if (tbody) tbody.innerHTML = `<tr><td colspan="7">Error loading members</td></tr>`;
    if (listContainer) listContainer.innerHTML = `<p>Error loading members</p>`;
    return;
  }

  if (tbody) tbody.innerHTML = '';
  if (listContainer) listContainer.innerHTML = '';

  if (!data || data.length === 0) {
    if (tbody) tbody.innerHTML = `<tr><td colspan="7">No members found yet.</td></tr>`;
    if (listContainer) listContainer.innerHTML = `<p>No members found yet.</p>`;
    return;
  }

  // Render Desktop Table
  if (tbody) {
    data.forEach(member => {
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
    });
  }

  // Render Mobile Cards
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

  // IMPORTANT: Call this AFTER the buttons are added to the DOM
  setTimeout(addActionListeners, 10);   // Small delay ensures DOM is updated
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
    div.className = 'comment';
    div.innerHTML = `
      <strong>${comment.full_name || 'Crew Member'}</strong> 
      <small>${new Date(comment.created_at).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</small>
      <br>${comment.content}
    `;
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

  if (!content || !currentUser) {
    return alert("You must be logged in to comment.");
  }

  // Get the member's full name from the members table
  const { data: member, error: memberError } = await supabaseClient
    .from('members')
    .select('full_name')
    .eq('id', currentUser.id)
    .single();

  const displayName = member?.full_name && member.full_name.trim() !== '' 
                    ? member.full_name 
                    : (currentUser.email ? currentUser.email.split('@')[0] : 'Crew Member');

  const { error } = await supabaseClient.from('comments').insert({
    post_id: postId,
    user_id: currentUser.id,
    full_name: displayName,           // ← Now uses full name
    content: content
  });

  if (!error) {
    input.value = '';
    loadCommentsForPost(postId);
  } else {
    console.error(error);
    alert("Failed to post comment: " + error.message);
  }
}

function toggleCommentBox(postId) {
  const box = document.getElementById(`comment-box-${postId}`);
  box.style.display = box.style.display === 'none' ? 'block' : 'none';
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

  const { error } = await supabaseClient.from('posts').insert({
    user_id: currentUser.id,
    full_name: currentUser.email ? currentUser.email.split('@')[0] : 'Crew Member',
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
///////////////////////////////////


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
    updated_at: new Date().toISOString()
  };

  let error;

  if (currentEditingId) {
    // UPDATE
    ({ error } = await supabaseClient
      .from('members')
      .update(memberData)
      .eq('id', currentEditingId));

    if (!error) alert("✅ Member updated successfully!");
  } 
  else {
    // INSERT NEW MEMBER
    memberData.id = crypto.randomUUID();     // Generate new UUID

    // Optional: prevent duplicate emails
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

    if (!error) alert("✅ Member added successfully!");
  }

  if (error) {
    console.error("Save error:", error);
    alert('Error saving member: ' + error.message);
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
    
    if (error) {
      console.error("Auth error:", error);
      currentUser = null;
      return;
    }

    currentUser = user;
    console.log("Current user loaded:", currentUser?.email); // Helpful for debugging

    // Update any UI that shows user name if needed
    const nameEl = document.getElementById('fullName'); // or whatever displays user name
    if (nameEl && user) {
      nameEl.textContent = user.email ? user.email.split('@')[0] : "Crew Member";
    }
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

// ====================== GOLF SCRAMBLE LEADERBOARD ======================
let golfChannel = null;
let autoRefreshInterval = null;

async function loadGolfLeaderboard() {
  const tbody = document.getElementById('leaderboardBody');
  if (!tbody) return;

  tbody.innerHTML = `
    <tr>
      <td colspan="7" style="text-align:center; padding:40px; color:#00C7B2;">
        <i class="fas fa-spinner fa-spin"></i> Loading leaderboard...
      </td>
    </tr>`;

  const { data, error } = await supabaseClient
    .from('golf_teams')
    .select('*')
    .order('score', { ascending: true });   // Best score (lowest number) first

  if (error) {
    console.error(error);
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:40px;color:#ef4444;">Error loading leaderboard</td></tr>`;
    return;
  }

  tbody.innerHTML = '';

  if (data.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:60px;color:#9ca3af;">No teams added yet.<br><br>Click "Add Team" to get started.</td></tr>`;
    return;
  }

  data.forEach((team, index) => {
    const toPar = team.score || 0;
    const toParText = toPar < 0 ? toPar : toPar === 0 ? 'E' : `+${toPar}`;
    const toParClass = toPar < 0 ? 'topar-under' : toPar === 0 ? 'topar-even' : 'topar-over';

    const row = document.createElement('tr');
    row.innerHTML = `
      <td style="font-weight:700; font-size:19px; color:#00C7B2; text-align:center;">${index + 1}</td>
      <td style="font-weight:600;">${team.team_name}</td>
      <td style="color:#9ca3af; font-size:14.5px;">${team.players || '—'}</td>
      <td style="text-align:center; font-weight:700; font-size:19px; color:#00C7B2;">${team.score}</td>
      <td style="text-align:center;">${team.thru || 'F'}</td>
      <td class="${toParClass}" style="text-align:center; font-weight:700; font-size:18px;">${toParText}</td>
      <td style="text-align:center;">
        <button onclick="editTeam('${team.id}')" style="background:none;border:none;color:#00C7B2;font-size:18px;cursor:pointer;padding:4px 8px;">
          ✏️
        </button>
      </td>
    `;
    tbody.appendChild(row);
  });

  document.getElementById('last-updated').textContent = `Last updated: Just now`;
}

// Auto Refresh every 15 seconds
function startAutoRefresh() {
  // Clear any existing interval
  if (autoRefreshInterval) clearInterval(autoRefreshInterval);
  
  autoRefreshInterval = setInterval(() => {
    if (document.getElementById('leaderboardBody')) {
      loadGolfLeaderboard();
    }
  }, 15000); // Refresh every 15 seconds
}

function refreshLeaderboard() {
  loadGolfLeaderboard();
}

// Stop auto refresh when leaving the page (optional cleanup)
window.addEventListener('beforeunload', () => {
  if (autoRefreshInterval) clearInterval(autoRefreshInterval);
});

function showAddTeamModal() {
  document.getElementById('teamModal').style.display = 'flex';
  document.getElementById('modalTeamTitle').textContent = 'Add New Team';
  document.getElementById('teamId').value = '';
  document.getElementById('teamName').value = '';
  document.getElementById('teamPlayers').value = '';
  document.getElementById('teamScore').value = 0;
  document.getElementById('teamThru').value = 'F';
}

function hideTeamModal() {
  document.getElementById('teamModal').style.display = 'none';
}

async function saveTeam() {
  const id = document.getElementById('teamId').value;
  const teamData = {
    team_name: document.getElementById('teamName').value.trim(),
    players: document.getElementById('teamPlayers').value.trim(),
    score: parseInt(document.getElementById('teamScore').value) || 0,
    thru: document.getElementById('teamThru').value.trim() || 'F',
    updated_at: new Date().toISOString()
  };

  let error;
  if (id) {
    ({ error } = await supabaseClient.from('golf_teams').update(teamData).eq('id', id));
  } else {
    ({ error } = await supabaseClient.from('golf_teams').insert([teamData]));
  }

  if (error) alert('Error saving team: ' + error.message);
  else {
    hideTeamModal();
    loadGolfLeaderboard();
  }
}

async function editTeam(id) {
  const { data } = await supabaseClient.from('golf_teams').select('*').eq('id', id).single();
  if (!data) return;

  document.getElementById('teamModal').style.display = 'flex';
  document.getElementById('modalTeamTitle').textContent = 'Edit Team';
  document.getElementById('teamId').value = data.id;
  document.getElementById('teamName').value = data.team_name;
  document.getElementById('teamPlayers').value = data.players || '';
  document.getElementById('teamScore').value = data.score;
  document.getElementById('teamThru').value = data.thru || 'F';
}

function refreshLeaderboard() {
  loadGolfLeaderboard();
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

  // ====================== GOLF LEADERBOARD PAGE SETUP ======================
if (document.getElementById('leaderboardBody')) {
  await loadUser();
  
  loadGolfLeaderboard();
  startAutoRefresh();                    // ← Auto refresh starts here

  // Real-time updates (instant when someone changes score)
  if (!golfChannel) {
    golfChannel = supabaseClient.channel('golf-leaderboard')
      .on('postgres_changes', { 
        event: '*', 
        schema: 'public', 
        table: 'golf_teams' 
      }, () => {
        loadGolfLeaderboard();
      })
      .subscribe();
  }
}

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
  }

  // ====================== CALENDAR PAGE SETUP ======================
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