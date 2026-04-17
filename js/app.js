// app.js
const supabaseClient = supabase.createClient(
    'https://bwfwnpdjeovqeznwbckx.supabase.co',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ3ZnducGRqZW92cWV6bndiY2t4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYxOTI2NzIsImV4cCI6MjA5MTc2ODY3Mn0.QohjsfSgvw64ZwSLRCtr_4rh49JyInEmrpDdzrXISQU'
);

// Global variables
let currentEditingId = null;


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
    if (!tbody || !listContainer) return;

    const { data, error } = await supabaseClient
        .from('members')
        .select('*')
        .order('joined_date', { ascending: false });

    tbody.innerHTML = '';
    listContainer.innerHTML = '';

    if (error) {
        console.error(error);
        tbody.innerHTML = `<tr><td colspan="7">Error loading members</td></tr>`;
        return;
    }
    if (!data || data.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7">No members found yet.</td></tr>`;
        listContainer.innerHTML = `<p style="padding:1rem; text-align:center;">No members found yet.</p>`;
        return;
    }

    data.forEach(member => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td><strong>${member.full_name || 'N/A'}</strong></td>
            <td>${member.email || 'N/A'}</td>
            <td>${member.phone || 'N/A'}</td>
            <td>${member.role || 'Member'}</td>
            <td><span class="status ${member.status === 'Active' ? 'active' : 'inactive'}">${member.status || 'Active'}</span></td>
            <td>${new Date(member.joined_date).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}</td>
            <td>
                <button class="action-btn edit-btn" data-id="${member.id}">Edit</button>
                <button class="action-btn delete-btn" data-id="${member.id}">Delete</button>
            </td>
        `;
        tbody.appendChild(row);
    });

    data.forEach(member => {
        const card = document.createElement('div');
        card.className = 'member-card';
        card.innerHTML = `
            <div><strong>${member.full_name || 'N/A'}</strong></div>
            <div class="member-info"><span>Email</span><span>${member.email || 'N/A'}</span></div>
            <div class="member-info"><span>Phone</span><span>${member.phone || 'N/A'}</span></div>
            <div class="member-info"><span>Role</span><span>${member.role || 'Member'}</span></div>
            <div class="member-info"><span>Status</span><span><span class="status ${member.status === 'Active' ? 'active' : 'inactive'}">${member.status || 'Active'}</span></span></div>
            <div class="member-info"><span>Joined</span><span>${new Date(member.joined_date).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}</span></div>
            <div style="margin-top: 1rem; display: flex; gap: 10px;">
                <button class="action-btn edit-btn" data-id="${member.id}" style="flex:1;">Edit</button>
                <button class="action-btn delete-btn" data-id="${member.id}" style="flex:1;">Delete</button>
            </div>
        `;
        listContainer.appendChild(card);
    });

    addActionListeners();
}

function addActionListeners() {
    document.querySelectorAll('.edit-btn').forEach(btn => btn.addEventListener('click', () => editMember(btn.dataset.id)));
    document.querySelectorAll('.delete-btn').forEach(btn => btn.addEventListener('click', () => deleteMember(btn.dataset.id)));
}

// ====================== POLL FUNCTIONS ======================
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
        input.style.width = '100%';
        input.style.padding = '12px';
        input.style.margin = '6px 0';
        input.style.borderRadius = '8px';
        input.style.background = 'rgba(255,255,255,0.1)';
        input.style.color = 'white';
        input.style.border = '1px solid rgba(255,255,255,0.2)';
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
        document.getElementById('pollQuestion').value = '';
        alert("✅ Poll posted successfully!");
        loadFeed(currentSort);   // Refresh feed
    }
}

// ====================== EVENT FUNCTIONS ======================
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
    if (!dateStr) return alert("Please select a date and time for the event.");

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

    if (error) {
        alert("Failed to create event: " + error.message);
    } else {
        hideEventModal();
        // Clear form
        document.getElementById('eventTitle').value = '';
        document.getElementById('eventDate').value = '';
        document.getElementById('eventLocation').value = '';
        document.getElementById('eventDesc').value = '';
        alert("✅ Event scheduled successfully!");
        loadFeed(currentSort);   // Refresh feed
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

// ====================== DASHBOARD LIVE FEED ======================
let currentUser = null;
let selectedFiles = [];
let pollOptions = ["", ""];
let feedChannel = null;
let currentSort = 'latest';

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

function renderPost(post) {
    console.log("renderPost called for post ID:", post.id);

    const container = document.getElementById('feedContainer');
    if (!container) return;

    const postEl = document.createElement('div');
    postEl.className = 'card';
    postEl.style.marginBottom = '20px';

    let html = `
        <p><strong>${post.full_name || 'Crew Member'}</strong> • ${new Date(post.created_at).toLocaleString()}</p>
    `;

    // Show content only for non-poll posts
    if (post.post_type !== 'poll') {
        html += `<p>${post.content || ''}</p>`;
    }

    // Images
    if (post.image_urls && Array.isArray(post.image_urls) && post.image_urls.length > 0) {
        html += `<div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 10px; margin: 12px 0;">`;
        post.image_urls.forEach(url => {
            if (url) {
                html += `<img src="${url}" style="width:100%; border-radius:12px; object-fit:cover; max-height:340px; cursor:pointer;" onclick="window.open('${url}', '_blank')">`;
            }
        });
        html += `</div>`;
    }

    // ==================== POLL VOTING (Clean - No Duplicate) ====================
    if (post.post_type === 'poll' && Array.isArray(post.poll_options)) {
        html += `<h4 style="margin:12px 0 10px; color:#00b894; font-weight:600;">
                    ${post.content || 'Poll Question'}
                 </h4>`;
        
        post.poll_options.forEach((option, index) => {
            const votes = (post.poll_votes && post.poll_votes[option]) || 0;
            const totalVotes = Object.values(post.poll_votes || {}).reduce((a, b) => a + b, 0);
            const percentage = totalVotes > 0 ? Math.round((votes / totalVotes) * 100) : 0;

            html += `
                <div onclick="voteOnPoll('${post.id}', '${option}')" 
                     style="background:rgba(255,255,255,0.1); padding:12px; margin:6px 0; border-radius:8px; cursor:pointer; transition:0.2s;"
                     onmouseover="this.style.background='rgba(0,184,148,0.2)'" 
                     onmouseout="this.style.background='rgba(255,255,255,0.1)'">
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                        <span style="font-weight:500;">${option}</span>
                        <span style="font-size:0.9rem; opacity:0.9;">
                            <strong>${votes}</strong> votes (${percentage}%)
                        </span>
                    </div>
                    <div style="background:rgba(255,255,255,0.2); height:6px; border-radius:3px; margin-top:8px;">
                        <div style="background:#00b894; height:100%; width:${percentage}%; border-radius:3px; transition:width 0.4s;"></div>
                    </div>
                </div>`;
        });
    }

    // Event
    if (post.post_type === 'event' && post.event_title) {
        html += `<h3 style="color:#e67e22; margin:10px 0;">📅 ${post.event_title}</h3>
                 <p><strong>When:</strong> ${new Date(post.event_date).toLocaleString()}</p>`;
        if (post.event_location) html += `<p><strong>Where:</strong> ${post.event_location}</p>`;
        if (post.event_description) html += `<p>${post.event_description}</p>`;
    }

    // Like & Comment
        // Like & Comment Section
    const postId = post.id;
    html += `
        <div style="margin-top: 18px; display: flex; align-items: center; gap: 25px; padding-top: 12px; color:white; border-top: 1px solid rgba(255,255,255,0.15);">
            <button onclick="toggleLike('${postId}')" style="background:none; border:none; font-size:1.6rem; cursor:pointer;">
                ❤️ <span id="like-count-${postId}" style="font-size:1.15rem; color:white; font-weight:600;">${post.likes || 0}</span>
            </button>
            <button onclick="toggleCommentBox('${postId}')" style="background:none; color: white; border:none; font-size:1.25rem; cursor:pointer;">
                💬 Comment
            </button>
        </div>

        <!-- Sleeker Comment Box -->
        <div id="comment-box-${postId}" style="display:none; margin-top:12px;">
            <textarea id="comment-input-${postId}" placeholder="Write a comment..." rows="2" 
                      style="width:100%; padding:12px; border-radius:12px; background:rgba(255,255,255,0.08); color:white; font-size:1rem; resize:vertical;"></textarea>
            
            <div style="margin-top: 8px; display: flex; gap: 10px;">
                <button onclick="addComment('${postId}')" 
                        style="flex:1; padding:10px 16px; background:#00C7B2; color:white; border:none; border-radius:10px; font-weight:600; cursor:pointer; transition:0.2s;">
                    Post Comment
                </button>
                <button onclick="toggleCommentBox('${postId}')" 
                        style="padding:10px 16px; background:none; border:1px solid rgba(255,255,255,0.3); color:#ccc; border-radius:10px; cursor:pointer;">
                    Cancel
                </button>
            </div>
        </div>

        <div id="comments-${postId}" style="margin-top:15px; font-size:0.96rem; max-height:280px; overflow-y:auto;"></div>
    `;

    postEl.innerHTML = html;
    container.prepend(postEl);
    loadCommentsForPost(postId);
}

async function loadFeed(sortBy = 'latest') {
    currentSort = sortBy;
    const container = document.getElementById('feedContainer');
    if (!container) return;

    container.innerHTML = '<p style="text-align:center; opacity:0.7;">Loading feed...</p>';

    let query = supabaseClient.from('posts').select('*');

    if (sortBy === 'latest') {
        query = query.order('created_at', { ascending: true });
    } else if (sortBy === 'popular') {
        query = query.order('likes', { ascending: false });
    }

    const { data, error } = await query;

    container.innerHTML = '';
    if (error) {
        console.error(error);
        container.innerHTML = `<p style="color:red;">Error loading feed</p>`;
        return;
    }
    if (!data || data.length === 0) {
        container.innerHTML = `<p style="text-align:center; opacity:0.7;">No posts yet. Be the first!</p>`;
        return;
    }

    data.forEach(renderPost);
}

function changeSort() {
    const sortValue = document.getElementById('sortSelect').value;
    loadFeed(sortValue);
}

// ====================== LIKES (Simple & Reliable) ======================
async function toggleLike(postId) {
    console.log("❤️ Like clicked for post ID:", postId);

    // Get current likes
    const { data: current, error: fetchError } = await supabaseClient
        .from('posts')
        .select('likes')
        .eq('id', postId)
        .single();

    if (fetchError) {
        console.error("Failed to fetch current likes:", fetchError);
        return;
    }

    const currentLikes = current ? (current.likes || 0) : 0;
    const newLikes = currentLikes + 1;

    console.log(`Attempting to update likes from ${currentLikes} to ${newLikes}`);

    // Update in database
    const { error: updateError } = await supabaseClient
        .from('posts')
        .update({ likes: newLikes })
        .eq('id', postId);

    if (updateError) {
        console.error("❌ Update failed with error:", updateError);
        alert("Failed to update like: " + updateError.message);
    } else {
        console.log("✅ Successfully updated likes to", newLikes);
        
        // Update UI instantly
        const countEl = document.getElementById(`like-count-${postId}`);
        if (countEl) {
            countEl.textContent = newLikes;
            countEl.style.transform = 'scale(1.4)';
            setTimeout(() => countEl.style.transform = 'scale(1)', 200);
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

    container.innerHTML = data.length === 0 
        ? `<p style="opacity:0.6; font-size:0.9rem;">No comments yet.</p>` 
        : '';

    data.forEach(comment => {
        const div = document.createElement('div');
        div.style.marginBottom = '10px';
        div.innerHTML = `
            <strong>${comment.full_name || 'Crew Member'}</strong> 
            <span style="opacity:0.6; font-size:0.85rem;">${new Date(comment.created_at).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</span>
            <p style="margin:4px 0 0 0;">${comment.content}</p>
        `;
        container.appendChild(div);
    });
}

// ====================== POLL VOTING ======================
// ====================== POLL VOTING (One Vote Per User) ======================
async function voteOnPoll(postId, option) {
    if (!currentUser) {
        alert("You must be logged in to vote.");
        return;
    }

    console.log(`User ${currentUser.id} voting for "${option}" on post ${postId}`);

    // Fetch current poll data
    const { data: post, error: fetchError } = await supabaseClient
        .from('posts')
        .select('poll_votes, user_votes')
        .eq('id', postId)
        .single();

    if (fetchError) {
        console.error("Failed to fetch poll:", fetchError);
        alert("Could not load poll. Please try again.");
        return;
    }

    let pollVotes = post.poll_votes || {};
    let userVotes = post.user_votes || {};

    // Check if user has already voted on this poll
    if (userVotes[currentUser.id]) {
        alert("You have already voted on this poll!");
        return;
    }

    // Record the user's vote
    userVotes[currentUser.id] = option;

    // Increment the vote count for this option
    pollVotes[option] = (pollVotes[option] || 0) + 1;

    // Update the post
    const { error: updateError } = await supabaseClient
        .from('posts')
        .update({ 
            poll_votes: pollVotes,
            user_votes: userVotes 
        })
        .eq('id', postId);

    if (updateError) {
        console.error("Vote failed:", updateError);
        alert("Failed to record your vote. Please try again.");
    } else {
        console.log("✅ Vote recorded successfully!");
        alert(`You voted for: ${option}`);
        loadFeed(currentSort);   // Refresh to show updated results
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

    if (error) {
        alert("Failed to post comment: " + error.message);
    } else {
        input.value = '';
        loadCommentsForPost(postId);
    }
}

function toggleCommentBox(postId) {
    const box = document.getElementById(`comment-box-${postId}`);
    box.style.display = box.style.display === 'none' ? 'block' : 'none';
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
                .upload(fileName, file, { cacheControl: '3600', upsert: false });

            if (uploadError) {
                alert("Image upload failed: " + uploadError.message);
                return;
            }

            const publicUrl = `https://bwfwnpdjeovqeznwbckx.supabase.co/storage/v1/object/public/post-images/${fileName}`;
            imageUrls.push(publicUrl);
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

function subscribeToFeed() {
    if (feedChannel) return;

    feedChannel = supabaseClient.channel('crew-feed')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'posts' }, 
            (payload) => renderPost(payload.new))
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'comments' }, 
            (payload) => loadCommentsForPost(payload.new.post_id))
        .subscribe((status) => console.log('Realtime status:', status));
}

// ====================== MAIN INITIALIZATION ======================
document.addEventListener('DOMContentLoaded', async () => {
    // Navbar
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
        console.log("🚀 Dashboard initializing...");
        await loadUser();
        setupImagePreview();
        await loadFeed('latest');
        subscribeToFeed();
    }
    if (document.getElementById('calendarGrid')) {
    await loadSchedule();           // Load data first
    renderCalendar();               // Render with dots
    loadMembersIntoDropdown();      // Load members dropdown
    setupDayDetailsCloseButton();   // Setup X button
}
});

// ====================== SCHEDULE / CALENDAR ======================
let currentDate = new Date();
let scheduleData = {};   // { "2026-04-17": [{name, area, status}, ...] }

// Load schedule data
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
            name: item.member_name,
            area: item.area,
            status: item.status
        });
    });
}

// Render Calendar with simple coloured dots
function renderCalendar() {
    const grid = document.getElementById('calendarGrid');
    if (!grid) return;

    grid.innerHTML = '';
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();

    document.getElementById('monthYear').textContent = 
        currentDate.toLocaleString('default', { month: 'long', year: 'numeric' });

    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    // Previous month filler
    for (let i = firstDay - 1; i >= 0; i--) {
        grid.appendChild(createDayElement(0, true));
    }

    // Current month
    for (let day = 1; day <= daysInMonth; day++) {
        const dateStr = `${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
        grid.appendChild(createDayElement(day, false, dateStr));
    }

    // Next month filler
    const remaining = 42 - (firstDay + daysInMonth);
    for (let day = 1; day <= remaining; day++) {
        grid.appendChild(createDayElement(day, true));
    }
}

function createDayElement(dayNum, isOtherMonth, dateStr = '') {
    const dayEl = document.createElement('div');
    dayEl.className = `calendar-day ${isOtherMonth ? 'other-month' : ''}`;

    if (dateStr && new Date(dateStr).toDateString() === new Date().toDateString()) {
        dayEl.classList.add('today');
    }

    dayEl.innerHTML = `<div class="day-number">${dayNum || ''}</div>`;

    // Simple coloured dots
    if (dateStr && scheduleData[dateStr] && scheduleData[dateStr].length > 0) {
        const dotsContainer = document.createElement('div');
        dotsContainer.className = 'shift-dots';

        scheduleData[dateStr].forEach(shift => {
            const dot = document.createElement('div');
            dot.className = `dot ${shift.status === 'vacation' ? 'vacation' : 'working'}`;
            dotsContainer.appendChild(dot);
        });

        dayEl.appendChild(dotsContainer);
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

    dateTitle.textContent = new Date(dateStr).toLocaleDateString('en-US', {
        weekday: 'long', month: 'long', day: 'numeric', year: 'numeric'
    });
    dateTitle.dataset.date = dateStr;

    list.innerHTML = '';

    const shifts = scheduleData[dateStr] || [];

    if (shifts.length === 0) {
        list.innerHTML = '<p style="opacity:0.7;">No shifts scheduled for this day.</p>';
    } else {
        shifts.forEach(shift => {
            const item = document.createElement('div');
            item.className = `shift-item ${shift.status}`;
            item.innerHTML = `
                <strong>${shift.name}</strong><br>
                ${shift.status === 'vacation' 
                    ? '<span style="color:#FF4D4D;">On Vacation</span>' 
                    : `Area: <strong>${shift.area || 'Not specified'}</strong>`}
            `;
            list.appendChild(item);
        });
    }

    detailsPanel.classList.add('open');
}

// Close button
function setupDayDetailsCloseButton() {
    const closeBtn = document.getElementById('closeDetails');
    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            document.getElementById('dayDetails').classList.remove('open');
        });
    }
}

// Close button handler - attach it once
function setupDayDetailsCloseButton() {
    const closeBtn = document.getElementById('closeDetails');
    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            document.getElementById('dayDetails').classList.remove('open');
        });
    }
}

// Render Calendar
function renderCalendar() {
    const grid = document.getElementById('calendarGrid');
    if (!grid) return;

    grid.innerHTML = '';
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();

    document.getElementById('monthYear').textContent = 
        currentDate.toLocaleString('default', { month: 'long', year: 'numeric' });

    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    // Previous month filler
    for (let i = firstDay - 1; i >= 0; i--) {
        const dayEl = createDayElement(0, true);
        grid.appendChild(dayEl);
    }

    // Current month
    for (let day = 1; day <= daysInMonth; day++) {
        const dateStr = `${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
        const dayEl = createDayElement(day, false, dateStr);
        grid.appendChild(dayEl);
    }

    // Next month filler
    const remaining = 42 - (firstDay + daysInMonth);
    for (let day = 1; day <= remaining; day++) {
        const dayEl = createDayElement(day, true);
        grid.appendChild(dayEl);
    }
}

function createDayElement(dayNum, isOtherMonth, dateStr = '') {
    const dayEl = document.createElement('div');
    dayEl.className = `calendar-day ${isOtherMonth ? 'other-month' : ''}`;

    if (dateStr && new Date(dateStr).toDateString() === new Date().toDateString()) {
        dayEl.classList.add('today');
    }

    dayEl.innerHTML = `<div class="day-number">${dayNum || ''}</div>`;

    if (dateStr && scheduleData[dateStr] && scheduleData[dateStr].length > 0) {
        const dotContainer = document.createElement('div');
        dotContainer.className = 'shift-dots';
        scheduleData[dateStr].forEach(() => {
            const dot = document.createElement('div');
            dot.className = 'dot';
            dotContainer.appendChild(dot);
        });
        dayEl.appendChild(dotContainer);
    }

    if (dateStr) {
        dayEl.addEventListener('click', () => showDayDetails(dateStr));
    }

    return dayEl;
}

// Calendar Navigation
document.addEventListener('DOMContentLoaded', () => {
    // ... your existing code ...

    if (document.getElementById('calendarGrid')) {
        loadSchedule().then(() => {
        renderCalendar();
        loadMembersIntoDropdown();   // Load members into dropdown
    setupDayDetailsCloseButton();
    });
    

    // ... keep your existing prevMonth, nextMonth, todayBtn, closeDetails listeners
}
});
// ====================== SCHEDULE FUNCTIONS ======================

// Load all members into the dropdown
async function loadMembersIntoDropdown() {
    const select = document.getElementById('shiftMember');
    if (!select) return;

    const { data, error } = await supabaseClient
        .from('members')
        .select('full_name')
        .order('full_name');

    if (error) {
        console.error("Failed to load members:", error);
        return;
    }

    // Clear and add default option
    select.innerHTML = '<option value="">Select Member...</option>';

    data.forEach(member => {
        const option = document.createElement('option');
        option.value = member.full_name;
        option.textContent = member.full_name;
        select.appendChild(option);
    });
}

// Add a new shift
async function addShift() {
    const dateStr = document.getElementById('selectedDate').dataset.date;
    const memberName = document.getElementById('shiftMember').value.trim();
    const area = document.getElementById('shiftArea').value.trim();
    const status = document.getElementById('shiftStatus').value;

    if (!dateStr) return alert("Please select a date first.");
    if (!memberName) return alert("Please select a member.");
    if (!area) return alert("Please select an area.");

    const { error } = await supabaseClient
        .from('schedule')
        .insert([{
            date: dateStr,
            member_name: memberName,
            area: area,
            status: status
        }]);

    if (error) {
        alert("Failed to save shift: " + error.message);
    } else {
        // Clear form
        document.getElementById('shiftMember').value = '';
        document.getElementById('shiftArea').value = '';
        
        await loadSchedule();
        showDayDetails(dateStr);
        
        alert("Shift added successfully!");
    }
}

// Load schedule data
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

// Service Worker
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js')
            .then(reg => console.log('✅ Service Worker registered!', reg.scope))
            .catch(err => console.log('❌ Service Worker registration failed:', err));
    });
}