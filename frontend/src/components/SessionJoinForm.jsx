import React, { useState, useEffect } from 'react';
import styles from '../styles/tierlist.module.css';
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  arrayUnion,
  arrayRemove,
  onSnapshot,
  query,
  where,
  collection
} from "firebase/firestore";
import { db } from "../firebase";
import { useAuth } from "../contexts/AuthContext";

export default function SessionJoinForm({ onJoinSession }) {
  const { currentUser } = useAuth();
  const [sessionId, setSessionId] = useState('');
  const [sessionName, setSessionName] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [isJoining, setIsJoining] = useState(false);
  const [personalTierLists, setPersonalTierLists] = useState([]);
  const [recentSessions, setRecentSessions] = useState([]);
  const [error, setError] = useState('');

  // Real-time listener for user data
  useEffect(() => {
    if (!currentUser) return;

    const userRef = doc(db, "users", currentUser.uid);
    const unsubscribe = onSnapshot(userRef, (doc) => {
      if (doc.exists()) {
        const userData = doc.data();
        setPersonalTierLists(userData.personalTierLists || []);
        setRecentSessions(userData.recentSessions || []);
      }
    });

    return () => unsubscribe();
  }, [currentUser]);

  // Real-time listener for collaborative sessions to detect deletions
  useEffect(() => {
    if (!currentUser || recentSessions.length === 0) return;

    const sessionIds = recentSessions.map(session => session.id);
    const unsubscribes = [];

    sessionIds.forEach(sessionId => {
      const sessionRef = doc(db, "collaborativeSessions", sessionId);
      const unsubscribe = onSnapshot(sessionRef, (doc) => {
        if (!doc.exists()) {
          // Session was deleted, remove from user's recent sessions
          removeFromRecentSessions(sessionId);
        }
      });
      unsubscribes.push(unsubscribe);
    });

    return () => {
      unsubscribes.forEach(unsubscribe => unsubscribe());
    };
  }, [currentUser, recentSessions.map(s => s.id).join(',')]);

  const removeFromRecentSessions = async (sessionId) => {
    if (!currentUser) return;

    try {
      const userRef = doc(db, "users", currentUser.uid);
      const recentToRemove = recentSessions.find(s => s.id === sessionId);
      
      if (recentToRemove) {
        await updateDoc(userRef, {
          recentSessions: arrayRemove(recentToRemove),
          lastUpdated: new Date()
        });
        console.log(`Removed session ${sessionId} from recent sessions`);
      }
    } catch (error) {
      console.error("Error removing session from recent sessions:", error);
    }
  };

  const loadUserData = async () => {
    if (!currentUser) return;

    try {
      const userRef = doc(db, "users", currentUser.uid);
      const userDoc = await getDoc(userRef);
      
      if (userDoc.exists()) {
        const userData = userDoc.data();
        setPersonalTierLists(userData.personalTierLists || []);
        setRecentSessions(userData.recentSessions || []);
      } else {
        await setDoc(userRef, {
          personalTierLists: [],
          recentSessions: [],
          createdAt: new Date(),
          lastUpdated: new Date()
        });
      }
    } catch (error) {
      console.error("Error loading user data:", error);
    }
  };

  const generateSessionId = () => {
    const adjectives = ['Swift', 'Bright', 'Cool', 'Fast', 'Smart', 'Quick', 'Bold', 'Fresh'];
    const nouns = ['Tiger', 'Eagle', 'Rocket', 'Storm', 'Wave', 'Fire', 'Star', 'Phoenix'];
    const adjective = adjectives[Math.floor(Math.random() * adjectives.length)];
    const noun = nouns[Math.floor(Math.random() * nouns.length)];
    const number = Math.floor(Math.random() * 1000);
    return `${adjective}${noun}${number}`;
  };

  const addToPersonalTierLists = async (sessionId, sessionName) => {
    if (!currentUser) return;

    try {
      const userRef = doc(db, "users", currentUser.uid);
      const tierListEntry = {
        id: sessionId,
        name: sessionName,
        createdAt: new Date(),
        lastUpdated: new Date()
      };

      await updateDoc(userRef, {
        personalTierLists: arrayUnion(tierListEntry),
        lastUpdated: new Date()
      });
    } catch (error) {
      console.error("Error adding to personal tier lists:", error);
    }
  };

  const addToRecentSessions = async (sessionId, sessionName, isOwner = false) => {
    if (!currentUser) return;

    try {
      const userRef = doc(db, "users", currentUser.uid);
      const sessionEntry = {
        id: sessionId,
        name: sessionName,
        joinedAt: new Date(),
        isOwner: isOwner
      };

      const existingIndex = recentSessions.findIndex(s => s.id === sessionId);
      let updatedRecent = [...recentSessions];
      
      if (existingIndex >= 0) {
        updatedRecent.splice(existingIndex, 1);
      }

      updatedRecent.unshift(sessionEntry);
      updatedRecent = updatedRecent.slice(0, 5);

      await updateDoc(userRef, {
        recentSessions: updatedRecent,
        lastUpdated: new Date()
      });
    } catch (error) {
      console.error("Error adding to recent sessions:", error);
    }
  };

  const createSession = async () => {
    if (!sessionName.trim() || !currentUser) return;
    setIsCreating(true);
    setError('');

    try {
      const newSessionId = generateSessionId();
      const sessionRef = doc(db, "collaborativeSessions", newSessionId);
      const existingDoc = await getDoc(sessionRef);

      const fallbackId = generateSessionId() + '-' + Date.now();
      const refToUse = existingDoc.exists()
        ? doc(db, "collaborativeSessions", fallbackId)
        : sessionRef;
      const idToUse = existingDoc.exists() ? fallbackId : newSessionId;

      await setDoc(refToUse, {
        tierList: {
          id: idToUse,
          name: sessionName,
          tiers: [
            { id: 'tier-1', name: 'S', color: '#ff7f7f', items: [] },
            { id: 'tier-2', name: 'A', color: '#ffbf7f', items: [] },
            { id: 'tier-3', name: 'B', color: '#ffdf7f', items: [] },
            { id: 'tier-4', name: 'C', color: '#7fff7f', items: [] },
            { id: 'tier-5', name: 'D', color: '#7f7fff', items: [] }
          ],
          unrankedItems: []
        },
        createdBy: currentUser.uid,
        createdAt: new Date(),
        lastUpdated: new Date(),
        isPublic: true,
        participantCount: 1,
        participants: [currentUser.uid]
      });

      await addToPersonalTierLists(idToUse, sessionName);
      await addToRecentSessions(idToUse, sessionName, true);

      onJoinSession(idToUse);
    } catch (error) {
      console.error("Error creating session:", error);
      setError("Failed to create session. Please try again.");
    } finally {
      setIsCreating(false);
    }
  };

  const joinSession = async () => {
    if (!sessionId.trim()) return;
    setIsJoining(true);
    setError('');

    try {
      const sessionRef = doc(db, "collaborativeSessions", sessionId);
      const docSnap = await getDoc(sessionRef);

      if (docSnap.exists()) {
        const sessionData = docSnap.data();
        const sessionName = sessionData.tierList?.name || 'Untitled Tier List';
        
        const participants = sessionData.participants || [];
        if (!participants.includes(currentUser.uid)) {
          await updateDoc(sessionRef, {
            participants: arrayUnion(currentUser.uid),
            participantCount: participants.length + 1,
            lastUpdated: new Date()
          });
        }
        
        await addToRecentSessions(sessionId, sessionName, false);
        onJoinSession(sessionId);
      } else {
        setError("Session not found. Please check the session ID.");
      }
    } catch (error) {
      console.error("Error joining session:", error);
      setError("Failed to join session. Please try again.");
    } finally {
      setIsJoining(false);
    }
  };

  const joinRecentSession = (sessionId) => {
    onJoinSession(sessionId);
  };

  // Simplified delete function - only deletes the session document
  const deletePersonalTierList = async (sessionId) => {
  if (!currentUser) return;
 
  console.log("🗑️ Attempting to delete session:", sessionId);
  try {
    const userRef = doc(db, "users", currentUser.uid);
    const tierListToRemove = personalTierLists.find(t => t.id === sessionId);
   
    if (tierListToRemove) {
      const sessionRef = doc(db, "collaborativeSessions", sessionId);
      const sessionDoc = await getDoc(sessionRef);
     
      if (sessionDoc.exists()) {
        const sessionData = sessionDoc.data();
        const isOwner = sessionData.createdBy === currentUser.uid;
       
        if (isOwner) {
          // First, mark the session for deletion to kick out users
          await updateDoc(sessionRef, {
            markedForDeletion: true,
            deletedAt: new Date(),
            lastUpdated: new Date()
          });
          
          // THEN show confirmation dialog
          const isConfirmed = window.confirm("Are you sure you want to delete this tier list? This action cannot be undone and will remove all participants from the session.");
          
          if (!isConfirmed) {
            // User cancelled, remove the deletion flag
            await updateDoc(sessionRef, {
              markedForDeletion: false,
              deletedAt: null,
              lastUpdated: new Date()
            });
            return;
          }
         
          // Wait a moment for other users to be redirected, then delete
          setTimeout(async () => {
            try {
              await deleteDoc(sessionRef);
              console.log("🗑️ Session document deleted");
            } catch (error) {
              console.error("Error deleting session document:", error);
            }
          }, 2000); // 2 second delay
        }
      }
     
      // Remove from personal tier lists
      await updateDoc(userRef, {
        personalTierLists: arrayRemove(tierListToRemove),
        lastUpdated: new Date()
      });
    }
  } catch (error) {
    console.error("Error deleting personal tier list:", error);
    setError("Failed to delete tier list. Please try again.");
  }
};

// Add this state at the top with your other useState declarations
const [redirectMessage, setRedirectMessage] = useState('');

// Add this useEffect to listen for when users get kicked out
useEffect(() => {
  // Check if user was redirected due to session deletion
  const urlParams = new URLSearchParams(window.location.search);
  const reason = urlParams.get('reason');
  
  if (reason === 'session-deleted') {
    setRedirectMessage('The session you were in was deleted by the owner.');
    setTimeout(()=>setRedirectMessage(''), 3000);
    // Clear the URL parameter
    window.history.replaceState({}, '', window.location.pathname);
  } else if (reason === 'session-being-deleted') {
    setRedirectMessage('The session you were in is being deleted by the owner.');
    setTimeout(()=>setRedirectMessage(''), 3000);
    window.history.replaceState({}, '', window.location.pathname);
  }
}, []);

// Add this function to clear the message
const clearRedirectMessage = () => {
  setRedirectMessage('');
};

  const copySessionLink = (sessionId) => {
    navigator.clipboard.writeText(sessionId).then(() => {
      alert('Session ID copied to clipboard');
    });
  };

  const formatTimeAgo = (date) => {
    if (!date) return 'Unknown';

    let parsedDate;

    if (date instanceof Date) {
      parsedDate = date;
    } else if (typeof date === 'string' || typeof date === 'number') {
      parsedDate = new Date(date);
    } else if (date.seconds) {
      parsedDate = new Date(date.seconds * 1000);
    } else {
      return 'Invalid date';
    }

    if (isNaN(parsedDate)) return 'Invalid date';

    const now = new Date();
    const diffMs = now - parsedDate;
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;

    return parsedDate.toLocaleDateString();
  };

  if (!currentUser) {
    return (
      <div className={styles.main}>
        <div className={styles.emptyState}>
          <h2>Please Sign In</h2>
          <p>You need to be signed in to join collaborative tier list sessions.</p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.main}>
      <div className={styles.sessionJoinContainer}>
        <h1>Collaborative Tier Lists</h1>

        {/* Add this message display */}
        {redirectMessage && (
          <div className={styles.redirectMessage}>
            <p>{redirectMessage}</p>
            <button onClick={clearRedirectMessage} className={styles.closeBtn}>
              ×
            </button>
          </div>
        )}

        {error && <div className={styles.errorMessage}>{error}</div>}

        {/* Create Session */}
        <div className={styles.sessionSection}>
          <h3>Create New Session</h3>
          <div className={styles.createForm}>
            <input
              type="text"
              placeholder="Tier list name..."
              value={sessionName}
              onChange={(e) => setSessionName(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && createSession()}
            />
            <button
              onClick={createSession}
              disabled={isCreating || !sessionName.trim()}
              className={styles.primaryBtn}
            >
              {isCreating ? 'Creating...' : 'Create Session'}
            </button>
          </div>
          <p className={styles.helpText}>
            Creates a new collaborative tier list that others can join
          </p>
        </div>

        {/* Join Session */}
        <div className={styles.sessionSection}>
          <h3>Join Existing Session</h3>
          <div className={styles.joinForm}>
            <input
              type="text"
              placeholder="Enter session ID..."
              value={sessionId}
              onChange={(e) => setSessionId(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && joinSession()}
            />
            <button
              onClick={joinSession}
              disabled={isJoining || !sessionId.trim()}
              className={styles.primaryBtn}
            >
              {isJoining ? 'Joining...' : 'Join Session'}
            </button>
          </div>
          <p className={styles.helpText}>
            Enter a session ID shared by another user
          </p>
        </div>

        {/* Personal Tier Lists */}
        {personalTierLists.length > 0 && (
          <div className={styles.sessionSection}>
            <h3>My Tier Lists</h3>
            <div className={styles.sessionList}>
              {personalTierLists.map(tierList => (
                <div key={tierList.id} className={styles.sessionCard}>
                  <div className={styles.sessionInfo}>
                    <h4>{tierList.name}</h4>
                    <p className={styles.sessionMeta}>
                      ID: {tierList.id} • Created {formatTimeAgo(tierList.createdAt)}
                    </p>
                    <p className={styles.sessionMeta}>
                      Owner • Last updated {formatTimeAgo(tierList.lastUpdated)}
                    </p>
                  </div>
                  <div className={styles.sessionActions}>
                    <button
                      onClick={() => joinRecentSession(tierList.id)}
                      className={styles.primaryBtn}
                    >
                      Open
                    </button>
                    <button
                      onClick={() => copySessionLink(tierList.id)}
                      className={styles.secondaryBtn}
                      title="Copy session ID"
                    >
                      🔗
                    </button>
                    <button
                      onClick={() => deletePersonalTierList(tierList.id)}
                      className={styles.dangerBtn}
                      title="Delete tier list"
                    >
                      🗑️
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Recent Sessions */}
        {recentSessions.length > 0 && (
          <div className={styles.sessionSection}>
            <h3>Recent Sessions</h3>
            <div className={styles.sessionList}>
              {recentSessions.map(session => (
                <div key={session.id} className={styles.sessionCard}>
                  <div className={styles.sessionInfo}>
                    <h4>{session.name}</h4>
                    <p className={styles.sessionMeta}>
                      ID: {session.id} • Joined {formatTimeAgo(session.joinedAt)}
                    </p>
                    <p className={styles.sessionMeta}>
                      {session.isOwner ? 'Owner' : 'Participant'}
                    </p>
                  </div>
                  <div className={styles.sessionActions}>
                    <button
                      onClick={() => joinRecentSession(session.id)}
                      className={styles.primaryBtn}
                    >
                      Join
                    </button>
                    <button
                      onClick={() => copySessionLink(session.id)}
                      className={styles.secondaryBtn}
                      title="Copy session ID"
                    >
                      🔗
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Instructions */}
        <div className={styles.sessionSection}>
          <h3>How it works</h3>
          <div className={styles.instructions}>
            <div className={styles.instruction}>
              <span className={styles.stepNumber}>1</span>
              <div>
                <strong>Create or Join</strong>
                <p>Create a new session or join an existing one with a session ID</p>
              </div>
            </div>
            <div className={styles.instruction}>
              <span className={styles.stepNumber}>2</span>
              <div>
                <strong>Collaborate</strong>
                <p>Work together in real-time to build your tier list</p>
              </div>
            </div>
            <div className={styles.instruction}>
              <span className={styles.stepNumber}>3</span>
              <div>
                <strong>Share</strong>
                <p>Share the session ID with friends to invite them</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}