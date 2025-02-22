// ====================== script.js (Enhanced) ======================

var socket = io();
var currentRecipient = null;
var typingTimeout;
var darkMode = false;

// Audio call variables
var localStream;
var peerConnection;
var activeCallUser = null;
const peerConnectionConfig = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
};

function showUserList() {
  // On mobile, show the user list
  $("#conversationView").removeClass("active");
  $("#userList").addClass("active");
}

function showConversation(recipient) {
  currentRecipient = recipient;
  $("#userList").removeClass("active");
  $("#conversationView").addClass("active");
  $("#conversationTitle").text(`Conversation with ${recipient}`);
  $("#messages").empty();
  $("#typingIndicator").text("");
  // Request old messages
  socket.emit("get messages", { withUser: recipient });
}

function toggleDarkMode() {
  darkMode = !darkMode;
  if (darkMode) {
    document.body.classList.add("dark-mode");
  } else {
    document.body.classList.remove("dark-mode");
  }
}

// Audio Call functions
function initiateAudioCall() {
  if (!currentRecipient) return;
  activeCallUser = currentRecipient;
  startLocalStream()
    .then(function () {
      createPeerConnection();
      peerConnection.addStream(localStream);
      peerConnection
        .createOffer()
        .then(function (offer) {
          return peerConnection.setLocalDescription(offer);
        })
        .then(function () {
          socket.emit("call user", {
            recipient: currentRecipient,
            offer: peerConnection.localDescription,
          });
          showInCallUI(activeCallUser);
        })
        .catch(function (error) {
          console.error("Error during call initiation:", error);
        });
    })
    .catch(function (err) {
      console.error("Failed to get local stream", err);
    });
}

function startLocalStream() {
  return navigator.mediaDevices
    .getUserMedia({ audio: true, video: false })
    .then(function (stream) {
      localStream = stream;
    });
}

function createPeerConnection() {
  peerConnection = new RTCPeerConnection(peerConnectionConfig);
  peerConnection.onicecandidate = function (event) {
    if (event.candidate) {
      socket.emit("webrtc signal", {
        recipient: activeCallUser,
        signal: { ice: event.candidate },
      });
    }
  };

  // For browsers using onaddstream
  peerConnection.onaddstream = function (event) {
    var remoteAudio = document.getElementById("remoteAudio");
    if (!remoteAudio) {
      remoteAudio = document.createElement("audio");
      remoteAudio.id = "remoteAudio";
      remoteAudio.autoplay = true;
      document.body.appendChild(remoteAudio);
    }
    remoteAudio.srcObject = event.stream;
  };

  // For browsers using ontrack
  peerConnection.ontrack = function (event) {
    var remoteAudio = document.getElementById("remoteAudio");
    if (!remoteAudio) {
      remoteAudio = document.createElement("audio");
      remoteAudio.id = "remoteAudio";
      remoteAudio.autoplay = true;
      document.body.appendChild(remoteAudio);
    }
    remoteAudio.srcObject =
      event.streams && event.streams[0] ? event.streams[0] : event.stream;
  };
}

function answerCall() {
  $("#callButtons").hide();
  $("#inCallControls").show();
  activeCallUser = currentRecipient;
  startLocalStream()
    .then(function () {
      createPeerConnection();
      peerConnection.addStream(localStream);
      var remoteOffer = window.incomingOffer;
      return peerConnection
        .setRemoteDescription(new RTCSessionDescription(remoteOffer));
    })
    .then(function () {
      return peerConnection.createAnswer();
    })
    .then(function (answer) {
      return peerConnection.setLocalDescription(answer);
    })
    .then(function () {
      socket.emit("answer call", {
        recipient: activeCallUser,
        answer: peerConnection.localDescription,
      });
      hideCallModal();
    })
    .catch(function (error) {
      console.error("Error answering call:", error);
    });
}

function declineCall() {
  socket.emit("end call", { recipient: currentRecipient });
  hideCallModal();
}

function endCall() {
  if (peerConnection) {
    peerConnection.close();
    peerConnection = null;
  }
  if (localStream) {
    localStream.getTracks().forEach((track) => track.stop());
    localStream = null;
  }
  socket.emit("end call", { recipient: activeCallUser });
  hideCallModal();
  activeCallUser = null;
}

function showCallModal(caller, offer) {
  $("#callModal").addClass("active");
  $("#callStatus").text("Incoming Audio Call");
  $("#callerInfo").text("Call from: " + caller);
  currentRecipient = caller;
  window.incomingOffer = offer;
}

function hideCallModal() {
  $("#callModal").removeClass("active");
  $("#callStatus").text("");
  $("#callerInfo").text("");
  $("#callButtons").show();
  $("#inCallControls").hide();
}

function showInCallUI(caller) {
  $("#callModal").addClass("active");
  $("#callStatus").text("In Call");
  $("#callerInfo").text("Talking with: " + caller);
  $("#callButtons").hide();
  $("#inCallControls").show();
  $("#activeCallUser").text(caller);
}

function logout() {
  window.location.href = "/logout";
}

// Utility: Scroll messages to bottom after appending new message
function scrollMessages() {
  var messagesDiv = $("#messages");
  messagesDiv.animate(
    { scrollTop: messagesDiv.prop("scrollHeight") },
    300
  );
}

// On DOM Ready
$(function () {
  // Typing indicator
  $("#message").on("input", function () {
    clearTimeout(typingTimeout);
    socket.emit("typing", { recipient: currentRecipient });
    typingTimeout = setTimeout(function () {
      socket.emit("stop typing", { recipient: currentRecipient });
    }, 2000);
  });

  // Send message (text or image)
  $("form").submit(function (event) {
    event.preventDefault();
    var message = $("#message").val();
    var fileInput = $("#image")[0];
    var formData = new FormData();

    if (currentRecipient && (message || fileInput.files.length > 0)) {
      if (fileInput.files.length > 0) {
        formData.append("image", fileInput.files[0]);
        $.ajax({
          url: "/upload",
          type: "POST",
          data: formData,
          processData: false,
          contentType: false,
          success: function (data) {
            socket.emit("private message", {
              recipient: currentRecipient,
              message: message,
              imageUrl: data.imageUrl,
            });
            if (message) {
              $("#messages")
                .append(
                  $("<div class='message sent'>")
                    .text(message)
                    .append(
                      `<span class="timestamp">${new Date().toLocaleTimeString()}</span>`
                    )
                )
                .hide()
                .fadeIn(300);
            }
            $("#messages")
              .append(
                $("<div class='message sent'>")
                  .html(
                    `<img src="${data.imageUrl}" class="img-fluid">`
                  )
                  .append(
                    `<span class="timestamp">${new Date().toLocaleTimeString()}</span>`
                  )
              )
              .hide()
              .fadeIn(300);
            $("#message").val("");
            $("#image").val("");
            scrollMessages();
          },
          error: function (err) {
            alert("Error uploading image.");
          },
        });
      } else {
        socket.emit("private message", {
          recipient: currentRecipient,
          message: message,
        });
        $("#messages")
          .append(
            $("<div class='message sent'>")
              .text(message)
              .append(
                `<span class="timestamp">${new Date().toLocaleTimeString()}</span>`
              )
          )
          .hide()
          .fadeIn(300);
        $("#message").val("");
        scrollMessages();
      }
    }
  });

  // Receive a private message
  socket.on("private message", function ({ sender, message, imageUrl }) {
    if (currentRecipient === sender) {
      if (message) {
        $("#messages")
          .append(
            $("<div class='message received'>")
              .text(message)
              .append(
                `<span class="timestamp">${new Date().toLocaleTimeString()}</span>`
              )
          )
          .hide()
          .fadeIn(300);
      }
      if (imageUrl) {
        $("#messages")
          .append(
            $("<div class='message received'>")
              .html(`<img src="${imageUrl}" class="img-fluid">`)
              .append(
                `<span class="timestamp">${new Date().toLocaleTimeString()}</span>`
              )
          )
          .hide()
          .fadeIn(300);
      }
      $("#notificationSound")[0].play();
      scrollMessages();
    } else {
      // Highlight the user in the list if the message is from a different user
      $("#userList .user-item").each(function () {
        if ($(this).text().trim() === sender) {
          $(this).addClass("font-weight-bold");
        }
      });
    }
  });

  // Update user list
  socket.on("updateUserList", function (users) {
    $(".user-list-body").empty();
    users.forEach(function (user) {
      $(".user-list-body").append(
        $("<button class='list-group-item list-group-item-action user-item'>")
          .html(`<span class="online-status"></span>${user}`)
          .click(function () {
            $(this).removeClass("font-weight-bold");
            showConversation(user);
          })
      );
    });
  });

  // Typing events
  socket.on("typing", function ({ sender }) {
    if (currentRecipient === sender) {
      $("#typingIndicator").text(`${sender} is typing...`);
    }
  });
  socket.on("stop typing", function ({ sender }) {
    if (currentRecipient === sender) {
      $("#typingIndicator").text("");
    }
  });

  // Audio Call events
  socket.on("incoming call", function ({ caller, offer }) {
    showCallModal(caller, offer);
  });
  socket.on("call accepted", function ({ answer }) {
    peerConnection
      .setRemoteDescription(new RTCSessionDescription(answer))
      .catch(function (err) {
        console.error(
          "Error setting remote description on call accepted:",
          err
        );
      });
    showInCallUI(activeCallUser);
  });
  socket.on("webrtc signal", function ({ signal, sender }) {
    if (signal.ice) {
      peerConnection
        .addIceCandidate(new RTCIceCandidate(signal.ice))
        .catch(function (err) {
          console.error("Error adding received ICE candidate", err);
        });
    }
  });
  socket.on("call ended", function ({ caller }) {
    endCall();
    hideCallModal();
  });

  // Message history
  socket.on("message history", function (messages) {
    $("#messages").empty();
    messages.forEach(function (msg) {
      const time = new Date(msg.timestamp).toLocaleTimeString();
      if (msg.sender === currentRecipient) {
        // "received"
        if (msg.message) {
          $("#messages").append(
            $("<div class='message received'>")
              .text(msg.message)
              .append(`<span class="timestamp">${time}</span>`)
          );
        }
        if (msg.image_url) {
          $("#messages").append(
            $("<div class='message received'>")
              .html(`<img src="${msg.image_url}" class="img-fluid">`)
              .append(`<span class="timestamp">${time}</span>`)
          );
        }
      } else {
        // "sent"
        if (msg.message) {
          $("#messages").append(
            $("<div class='message sent'>")
              .text(msg.message)
              .append(`<span class="timestamp">${time}</span>`)
          );
        }
        if (msg.image_url) {
          $("#messages").append(
            $("<div class='message sent'>")
              .html(`<img src="${msg.image_url}" class="img-fluid">`)
              .append(`<span class="timestamp">${time}</span>`)
          );
        }
      }
    });
    scrollMessages();
  });
});
