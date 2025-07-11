// hooks/useRealtimeCollaboration.jsx
import { useEffect, useState, useCallback, useRef } from "react";
import { ref, set, onValue, remove, push, serverTimestamp, onDisconnect, off } from "firebase/database";
import { rtdb, auth } from "../firebase";
import { onAuthStateChanged } from "firebase/auth";

export const useRealtimeCursors = (sessionId) => {
  const [cursors, setCursors] = useState({});
  const [activeUsers, setActiveUsers] = useState({});
  const [liveActions, setLiveActions] = useState({});
  const [user, setUser] = useState(null);
  const [otherUserDragOverStates, setOtherUserDragOverStates] = useState({});

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, setUser);
    return unsubscribe;
  }, []);

  // Update cursor position (throttled)
  const lastCursorSent = useRef(0);
  const updateCursor = useCallback((x, y) => {
    if (!user || !sessionId) return;

    const now = Date.now();
    if (now - lastCursorSent.current < 50) return; // Throttle to 20fps
    lastCursorSent.current = now;

    const cursorRef = ref(rtdb, `sessions/${sessionId}/cursors/${user.uid}`);
    set(cursorRef, {
      x,
      y,
      displayName: user.displayName || user.email,
      uid: user.uid,
      lastSeen: serverTimestamp(),
    });
  }, [sessionId, user]);

  // Broadcast live actions
  const broadcastAction = useCallback((actionType, data, duration = 3000) => {
    if (!user || !sessionId) return;

    const actionsRef = ref(rtdb, `sessions/${sessionId}/actions`);
    const newActionRef = push(actionsRef);

    set(newActionRef, {
      type: actionType,
      data,
      user: {
        uid: user.uid,
        displayName: user.displayName || user.email,
      },
      timestamp: serverTimestamp(),
      expiresAt: Date.now() + duration,
    });

    setTimeout(() => {
      remove(newActionRef);
    }, duration);
  }, [sessionId, user]);

  // Join session
const joinSession = useCallback(() => {
  if (!user || !sessionId) return;

  const cursorRef = ref(rtdb, `sessions/${sessionId}/cursors/${user.uid}`);
  const userRef = ref(rtdb, `sessions/${sessionId}/activeUsers/${user.uid}`);
  const dragStateRef = ref(rtdb, `sessions/${sessionId}/dragStates/${user.uid}`);
  const editStateRef = ref(rtdb, `sessions/${sessionId}/editStates/${user.uid}`);
  const dragOverStateRef = ref(rtdb, `sessions/${sessionId}/dragOverStates/${user.uid}`); // Add this line

  set(userRef, {
    uid: user.uid,
    displayName: user.displayName || user.email,
    joinedAt: serverTimestamp(),
    lastSeen: serverTimestamp(),
  });

  onDisconnect(cursorRef).remove();
  onDisconnect(userRef).remove();
  onDisconnect(dragStateRef).remove();
  onDisconnect(editStateRef).remove();
  onDisconnect(dragOverStateRef).remove(); // Add this line
}, [sessionId, user]);

  // In your hook, broadcast drag states

// Add this new function after broadcastDragState
const broadcastDragOverState = useCallback((tierId, positionObject, show=true, src=null) => {
  if (!user || !sessionId) return;
 
  const dragOverStateRef = ref(rtdb, `sessions/${sessionId}/dragOverStates/${user.uid}`);
  if (tierId && positionObject) {
    set(dragOverStateRef, {
      tierId,
      index: positionObject.index,
      position: positionObject.position,
      src: src,
      show: show,
      timestamp: Date.now()
    });
  } else {
    remove(dragOverStateRef);
  }
}, [sessionId, user]);

// Update the broadcastDragState function in useRealtimeCursors hook
const broadcastDragState = useCallback((itemId, isDragging, itemData = null) => {
  if (!user || !sessionId) return;
  
  const dragStateRef = ref(rtdb, `sessions/${sessionId}/dragStates/${user.uid}`);
  if (isDragging && itemId) {
    set(dragStateRef, {
      itemId,
      itemData, // Include the full item data for the ghost
      isDragging: true,
      timestamp: Date.now()
    });
  } else {
    remove(dragStateRef);
  }
}, [sessionId, user]);


// Track what others are editing
const broadcastEditState = useCallback((elementId, isEditing, elementType) => {
  const editStateRef = ref(rtdb, `sessions/${sessionId}/editStates/${user.uid}`);
  if (isEditing) {
    set(editStateRef, {
      elementId,
      elementType, // 'title', 'item', 'tier'
      isEditing: true,
      timestamp: Date.now()
    });
  } else {
    remove(editStateRef);
  }
}, [sessionId, user]);

// Listen to other users' drag states
const [otherUserDragStates, setOtherUserDragStates] = useState({});
const [otherUserEditStates, setOtherUserEditStates] = useState({});

// Update your cleanup functions
const leaveSession = useCallback(() => {
  if (!user || !sessionId) return;
  remove(ref(rtdb, `sessions/${sessionId}/cursors/${user.uid}`));
  remove(ref(rtdb, `sessions/${sessionId}/activeUsers/${user.uid}`));
  remove(ref(rtdb, `sessions/${sessionId}/dragStates/${user.uid}`));
  remove(ref(rtdb, `sessions/${sessionId}/editStates/${user.uid}`));
  remove(ref(rtdb, `sessions/${sessionId}/dragOverStates/${user.uid}`)); // Add this line
}, [sessionId, user]);
  // Listen to cursors
  useEffect(() => {
    if (!sessionId || !user) return;

    const cursorsRef = ref(rtdb, `sessions/${sessionId}/cursors`);
    const callback = (snapshot) => {
      const data = snapshot.val() || {};
      const filtered = Object.fromEntries(
        Object.entries(data).filter(([uid]) => uid !== user.uid)
      );
      setCursors(filtered);
    };

    onValue(cursorsRef, callback);
    return () => off(cursorsRef, 'value', callback);
  }, [sessionId, user]);


// Add this listener effect (put it with your other useEffect listeners)
useEffect(() => {
  if (!sessionId || !user) return;

  const dragOverStatesRef = ref(rtdb, `sessions/${sessionId}/dragOverStates`);
  const callback = (snapshot) => {
    const data = snapshot.val() || {};
    const filtered = Object.fromEntries(
      Object.entries(data).filter(([uid]) => uid !== user.uid)
    );
    setOtherUserDragOverStates(filtered);
  };

  onValue(dragOverStatesRef, callback);
  return () => off(dragOverStatesRef, 'value', callback);
}, [sessionId, user]);

// Auto-cleanup stale drag states
useEffect(() => {
  const interval = setInterval(() => {
    setOtherUserDragStates(prev => {
      const now = Date.now();
      return Object.fromEntries(
        Object.entries(prev).filter(([uid, state]) => 
          now - state.timestamp < 30000 // Remove drag states older than 10 seconds
        )
      );
    });
  }, 2000);
  return () => clearInterval(interval);
}, []);

  // Listen to active users
  useEffect(() => {
    if (!sessionId) return;

    const usersRef = ref(rtdb, `sessions/${sessionId}/activeUsers`);
    const callback = (snapshot) => {
      const data = snapshot.val() || {};
      setActiveUsers(data);
    };

    onValue(usersRef, callback);
    return () => off(usersRef, 'value', callback);
  }, [sessionId]);

  // Listen to live actions
  useEffect(() => {
    if (!sessionId || !user) return;

    const actionsRef = ref(rtdb, `sessions/${sessionId}/actions`);
    const callback = (snapshot) => {
      const data = snapshot.val() || {};
      const now = Date.now();
      const filtered = Object.fromEntries(
        Object.entries(data).filter(([key, action]) =>
          action.user?.uid !== user.uid && (!action.expiresAt || action.expiresAt > now)
        )
      );
      setLiveActions(filtered);
    };

    onValue(actionsRef, callback);
    return () => off(actionsRef, 'value', callback);
  }, [sessionId, user]);

  // Listen to drag states
useEffect(() => {
  if (!sessionId || !user) return;

  const dragStatesRef = ref(rtdb, `sessions/${sessionId}/dragStates`);
  const callback = (snapshot) => {
    const data = snapshot.val() || {};
    const filtered = Object.fromEntries(
      Object.entries(data).filter(([uid]) => uid !== user.uid)
    );
    setOtherUserDragStates(filtered);
  };

  onValue(dragStatesRef, callback);
  return () => off(dragStatesRef, 'value', callback);
}, [sessionId, user]);

// Listen to edit states
useEffect(() => {
  if (!sessionId || !user) return;

  const editStatesRef = ref(rtdb, `sessions/${sessionId}/editStates`);
  const callback = (snapshot) => {
    const data = snapshot.val() || {};
    const filtered = Object.fromEntries(
      Object.entries(data).filter(([uid]) => uid !== user.uid)
    );
    setOtherUserEditStates(filtered);
  };

  onValue(editStatesRef, callback);
  return () => off(editStatesRef, 'value', callback);
}, [sessionId, user]);

  // Auto-join/leave
  useEffect(() => {
    if (!user || !sessionId) return;
    joinSession();
    return leaveSession;
  }, [joinSession, leaveSession, user, sessionId]);

  // Periodic cleanup of expired actions (client-side)
  useEffect(() => {
    const interval = setInterval(() => {
      setLiveActions(prev => {
        const now = Date.now();
        return Object.fromEntries(
          Object.entries(prev).filter(([key, action]) => !action.expiresAt || action.expiresAt > now)
        );
      });
    }, 1000);
    return () => clearInterval(interval);
  }, []);

    return {
      cursors,
      activeUsers,
      liveActions,
      otherUserDragStates,
      otherUserEditStates,
      otherUserDragOverStates, // Add this line
      updateCursor,
      broadcastAction,
      broadcastDragState,
      broadcastEditState,
      broadcastDragOverState, // Add this line
      joinSession,
      leaveSession
    };
};