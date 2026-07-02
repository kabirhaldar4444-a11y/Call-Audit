import React, { useState, useRef, useEffect } from 'react';
import './AudioPlayer.css';
import { FiPlay, FiPause, FiX, FiActivity, FiPlus, FiMinus, FiVolume2, FiVolumeX } from 'react-icons/fi';
import { FaHeadphones } from 'react-icons/fa';

const AudioPlayer = ({ audioUrl, callInfo, onClose }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [audioError, setAudioError] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [volume, setVolume] = useState(1); // Volume from 0 to 1
  const audioRef = useRef(null);

  useEffect(() => {
    setAudioError(false);
    if (audioRef.current) {
      audioRef.current.playbackRate = playbackSpeed;
    }
  }, [audioUrl, playbackSpeed]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume;
    }
  }, [volume]);

  const handlePlayPause = () => {
    if (audioError) return;
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
      } else {
        audioRef.current.play().catch(err => {
          console.error("Playback error:", err);
          setAudioError(true);
        });
      }
      setIsPlaying(!isPlaying);
    }
  };

  const handleSkip = (seconds) => {
    if (audioRef.current) {
      audioRef.current.currentTime = Math.max(0, Math.min(duration, audioRef.current.currentTime + seconds));
    }
  };

  const handleTimeUpdate = () => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime);
    }
  };

  const handleLoadedMetadata = () => {
    if (audioRef.current) {
      setDuration(audioRef.current.duration);
    }
  };

  const handleProgressChange = (e) => {
    if (audioRef.current) {
      audioRef.current.currentTime = (e.target.value / 100) * duration;
      setCurrentTime(audioRef.current.currentTime);
    }
  };

  const formatTime = (time) => {
    if (!time || isNaN(time)) return '00:00';
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };

  const getPlayableUrl = (url) => {
    if (!url) return '';
    if (url.startsWith('http')) {
      return url;
    }
    return `${process.env.REACT_APP_API_URL.replace('/api', '')}${url}`;
  };

  const toggleMute = () => {
    setVolume(prev => prev > 0 ? 0 : 1);
  };

  return (
    <div className="audio-player-overlay">
      <div className="audio-player-modal premium">
        <div className="player-header">
          <div className="title-section">
            <FaHeadphones className="header-icon" />
            <h3>Call Recording</h3>
          </div>
          <button className="close-btn" onClick={onClose}>
            <FiX size={20} />
          </button>
        </div>

        <div className="player-body">
          <div className="call-meta">
            <h4>Call with {callInfo?.phoneNumber || 'Customer'}</h4>
            <p>Duration: {formatTime(duration)}</p>
            {audioUrl.startsWith('http') && (
              <a href={audioUrl} target="_blank" rel="noopener noreferrer" className="external-source-link">
                🔗 Open Original Link
              </a>
            )}
          </div>

          <div className="visualizer-mock">
            <FiActivity className="wave-icon" />
            <div className="waves">
              <span></span><span></span><span></span><span></span><span></span>
              <span></span><span></span><span></span><span></span><span></span>
            </div>
          </div>

          {audioError && (
            <div className="audio-error-msg">
              <p>Unable to play audio directly.</p>
              <p>Please use the <strong>Open Original Link</strong> above.</p>
            </div>
          )}

          <div className="progress-section">
            <input
              type="range"
              min="0"
              max="100"
              value={duration ? (currentTime / duration) * 100 : 0}
              onChange={handleProgressChange}
              className="styled-progress"
            />
            <div className="time-info">
              {formatTime(currentTime)} / {formatTime(duration)}
            </div>
          </div>

          <div className="controls-container">
            {/* Restructured Playback Row to prevent overflow */}
            <div className="playback-controls-row">
              <button onClick={() => handleSkip(-30)} className="playback-btn" title="Rewind 30s">⏪ 30s</button>
              <button onClick={() => handleSkip(-10)} className="playback-btn large" title="Rewind 10s">⏪ 10s</button>
              <button onClick={handlePlayPause} className="master-play" title="Play/Pause">
                {isPlaying ? <FiPause /> : <FiPlay />}
              </button>
              <button onClick={() => handleSkip(10)} className="playback-btn large" title="Forward 10s">10s ⏩</button>
              <button onClick={() => handleSkip(30)} className="playback-btn" title="Forward 30s">30s ⏩</button>
            </div>

            {/* Dedicated Sliders Section */}
            <div className="sliders-section">
              {/* Playback Speed Row */}
              <div className="slider-row">
                <div className="slider-header">
                  <span>Playback Speed</span>
                  <span className="slider-header-value">{playbackSpeed}x</span>
                </div>
                <div className="slider-input-wrapper">
                  <button 
                    onClick={() => setPlaybackSpeed(prev => Math.max(0.5, parseFloat((prev - 0.1).toFixed(1))))} 
                    className="slider-btn"
                    title="Decrease Speed"
                  >
                    <FiMinus />
                  </button>
                  <input 
                    type="range"
                    min="0.5"
                    max="5"
                    step="0.1"
                    value={playbackSpeed}
                    onChange={(e) => setPlaybackSpeed(parseFloat(e.target.value))}
                    className="audio-slider"
                  />
                  <button 
                    onClick={() => setPlaybackSpeed(prev => Math.min(5.0, parseFloat((prev + 0.1).toFixed(1))))} 
                    className="slider-btn"
                    title="Increase Speed"
                  >
                    <FiPlus />
                  </button>
                </div>
              </div>

              {/* Volume Row */}
              <div className="slider-row">
                <div className="slider-header">
                  <span>Volume</span>
                  <span className="slider-header-value">{Math.round(volume * 100)}%</span>
                </div>
                <div className="slider-input-wrapper">
                  <button onClick={toggleMute} className="slider-btn" title={volume > 0 ? "Mute" : "Unmute"}>
                    {volume > 0 ? <FiVolume2 /> : <FiVolumeX />}
                  </button>
                  <input 
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={volume}
                    onChange={(e) => setVolume(parseFloat(e.target.value))}
                    className="audio-slider"
                  />
                  <button 
                    onClick={() => setVolume(prev => Math.min(1.0, parseFloat((prev + 0.05).toFixed(2))))} 
                    className="slider-btn"
                    title="Increase Volume"
                  >
                    <FiPlus />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <audio
          ref={audioRef}
          src={getPlayableUrl(audioUrl)}
          onTimeUpdate={handleTimeUpdate}
          onLoadedMetadata={handleLoadedMetadata}
          onEnded={() => setIsPlaying(false)}
          onError={() => setAudioError(true)}
        />
      </div>
    </div>
  );
};

export default AudioPlayer;
