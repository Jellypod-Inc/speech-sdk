import io
import os
from typing import List, Dict, Optional, Union, Tuple
import openai
from pydantic import BaseModel
from route_tts.eleven_labs.client import CustomElevenLabsClient
from route_tts.camb_ai.client import CambAIClient
from route_tts.voices import OpenAIVoice, ElevenLabsVoice, CambAIVoice, Platform, Voice
from pydub import AudioSegment

class SpeechBlock(BaseModel):
    voice_id: str
    text: str

class TTS:
    def __init__(self, voices: List[Voice], openai_api_key: str = None, elevenlabs_api_key: str = None, camb_api_key: str = None):
        self.voices: Dict[str, Voice] = {voice.id: voice for voice in voices}

        self.openai_client = None
        self.elevenlabs_client = None
        self.camb_client = None

        if openai_api_key or os.getenv("OPENAI_API_KEY"):
            self.openai_client = openai.OpenAI(api_key=openai_api_key or os.getenv("OPENAI_API_KEY"))

        if elevenlabs_api_key or os.getenv("ELEVEN_API_KEY"):
            self.elevenlabs_client = CustomElevenLabsClient(api_key=elevenlabs_api_key or os.getenv("ELEVEN_API_KEY"))

        if camb_api_key or os.getenv("CAMB_API_KEY"):
            self.camb_client = CambAIClient(api_key=camb_api_key or os.getenv("CAMB_API_KEY"))

    def initialize_voices(self, voices: List[Voice]):
        """
        Initialize or update the voices dictionary.

        This method allows adding or updating voices after the TTS instance has been created.
        It can be used if voices were not provided during initialization.

        :param voices: List of Voice objects to be added or updated
        """
        for voice in voices:
            self.voices[voice.id] = voice

    def add_voice(self, voice: Voice):
        """
        Add a new voice to the TTS instance.

        This method allows adding a single voice after the TTS instance has been created.
        It can be used to dynamically add new voices as needed.

        :param voice: Voice object to be added
        """
        self.voices[voice.id] = voice

    def remove_voice(self, id: str):
        """
        Remove a voice from the TTS instance.

        This method allows removing a single voice from the TTS instance.
        It can be used to dynamically remove voices as needed.

        :param id: The ID of the voice to be removed
        :raises KeyError: If the id is not found in the voices dictionary
        """
        if id not in self.voices:
            raise KeyError(f"Voice with ID '{id}' not found")
        del self.voices[id]

    def list_voices(self) -> List[Voice]:
        """
        Returns a list of all available voices.

        This method provides a way to retrieve all the voices that have been
        initialized in the TTS instance.

        :return: List of Voice objects
        """
        return list(self.voices.values())

    def generate_eleven_labs_audio_group(self, eleven_labs_speech_block_group: List[SpeechBlock]) -> List[Tuple[AudioSegment, Optional[str]]]:
        eleven_labs_audio_segments = []
        previous_request_ids = []

        for i, block in enumerate(eleven_labs_speech_block_group):
            voice = self.voices[block.voice_id]
            is_first = i == 0
            is_last = i == len(eleven_labs_speech_block_group) - 1

            previous_text = None if is_first else " ".join(sb.text for sb in eleven_labs_speech_block_group[:i])
            next_text = None if is_last else " ".join(sb.text for sb in eleven_labs_speech_block_group[i+1:])

            audio_data, request_id = self._generate_elevenlabs_speech(
                voice,
                block.text,
                previous_request_ids=previous_request_ids[-3:],
                previous_text=previous_text,
                next_text=next_text
            )

            audio_segment = self._create_audio_segment(audio_data)
            eleven_labs_audio_segments.append((audio_segment, request_id))

            # Store the request ID for the next iteration
            previous_request_ids.append(request_id)

        return eleven_labs_audio_segments

    # TODO: Optimze speech generation. Certain models lack context so they can be generated in parallel.
    def generate_speech_list(self, speech_blocks: List[SpeechBlock], single_output: bool = True, normalize_outputs: bool = True, request_stitching: bool = True) -> Union[AudioSegment, List[AudioSegment]]:
        """
        Generate speech for a list of SpeechBlocks.

        Performs request conditioning/stiching on consecutive ElevenLabs speech blocks
        ref: https://elevenlabs.io/docs/api-reference/how-to-use-request-stitching

        This method takes a list of SpeechBlocks and generates audio for each one
        in sequence. It can return either a single combined AudioSegment or a list
        of individual AudioSegments.

        :param speech_blocks: List of SpeechBlock objects containing text and voice_id
        :param single_output: If True, returns a single combined AudioSegment;
                              if False, returns a list of individual AudioSegments
        :return: Either a single AudioSegment or a list of AudioSegments
        :raises ValueError: If any voice_id is not found or if there's an error in speech generation
        """

        audio_segments: List[AudioSegment] = []
        eleven_labs_speech_block_group: List[SpeechBlock] = []

        def is_eleven_labs_voice(speech_block: SpeechBlock):
            voice = self.voices[speech_block.voice_id]
            return voice.platform == Platform.ELEVENLABS

        def should_group_speech_block(speech_block: SpeechBlock):
            # If there's no block yet or if the last voice is the same
            return (not eleven_labs_speech_block_group or eleven_labs_speech_block_group[-1].voice_id == speech_block.voice_id)

        for i, speech_block in enumerate(speech_blocks):
            try:
                if (request_stitching):
                    if (is_eleven_labs_voice(speech_block)):
                        if (should_group_speech_block(speech_block)):
                            eleven_labs_speech_block_group.append(speech_block)
                        else:
                            # Create the current segment audio
                            eleven_labs_audio_segments = self.generate_eleven_labs_audio_group(eleven_labs_speech_block_group)
                            audio_segments.extend([segment for segment, _ in eleven_labs_audio_segments])

                            # Clear elevenlabs group and append new speech block
                            eleven_labs_speech_block_group.clear()
                            eleven_labs_speech_block_group.append(speech_block)
                    else:
                        # Create the current segment audio
                        if eleven_labs_speech_block_group:
                            eleven_labs_audio_segments = self.generate_eleven_labs_audio_group(eleven_labs_speech_block_group)
                            audio_segments.extend([segment for segment, _ in eleven_labs_audio_segments])
                            eleven_labs_speech_block_group.clear()

                        # Generate this speech block
                        audio_segment = self.generate_speech(speech_block)
                        audio_segments.append(audio_segment)

                else:
                    audio_segment = self.generate_speech(speech_block)
                    audio_segments.append(audio_segment)
            except Exception as e:
                raise ValueError(f"Error generating speech for block. Error: {str(e)}")

        # Add this block after the loop to process any remaining ElevenLabs speech blocks
        if eleven_labs_speech_block_group:
            eleven_labs_audio_segments = self.generate_eleven_labs_audio_group(eleven_labs_speech_block_group)
            audio_segments.extend([segment for segment, _ in eleven_labs_audio_segments])

        # Normalize the audio segments
        normalized_segments = self.normalize_audio(audio_segments, normalize_outputs)

        if single_output:
            # Combine all segments into a single AudioSegment
            combined_audio = AudioSegment.empty()
            for segment in normalized_segments:
                audio = segment[0] if isinstance(segment, tuple) else segment
                combined_audio += audio
            return combined_audio
        else:
            # Return a list of individual AudioSegments
            return [segment[0] if isinstance(segment, tuple) else segment for segment in normalized_segments]

    def normalize_audio(self, audio_segments: List[Union[AudioSegment, Tuple[AudioSegment, Optional[str]]]], normalize_outputs: bool, target_dBFS: float = -30.0, tolerance: float = 3.0) -> List[Union[AudioSegment, Tuple[AudioSegment, Optional[str]]]]:
        """
        Softly normalize the volume of multiple AudioSegments to be closer to a target dBFS level.

        :param audio_segments: List of AudioSegments or tuples (AudioSegment, request_id) to normalize
        :param normalize_outputs: Whether to perform normalization
        :param target_dBFS: Target dBFS level for normalization (default: -30.0)
        :param tolerance: Allowed deviation from target dBFS (default: 3.0)
        :return: List of normalized AudioSegments or tuples (AudioSegment, request_id)
        """
        if not normalize_outputs:
            return audio_segments

        def get_audio(item):
            return item[0] if isinstance(item, tuple) else item

        # Find the maximum and minimum dBFS across all segments
        max_dBFS = max(get_audio(segment).dBFS for segment in audio_segments)
        min_dBFS = min(get_audio(segment).dBFS for segment in audio_segments)

        # Calculate the current range and the target range
        current_range = max_dBFS - min_dBFS
        target_range = 2 * tolerance

        normalized_segments = []
        for segment in audio_segments:
            audio = get_audio(segment)
            if current_range > target_range:
                # Compress the range if it's larger than the target range
                normalized_dBFS = (audio.dBFS - min_dBFS) / current_range * target_range + (target_dBFS - tolerance)
                adjustment = normalized_dBFS - audio.dBFS
                normalized_audio = audio.apply_gain(adjustment)
            else:
                # If the range is already small enough, just center it around the target
                center_adjustment = target_dBFS - (max_dBFS + min_dBFS) / 2
                normalized_audio = audio.apply_gain(center_adjustment)

            if isinstance(segment, tuple):
                normalized_segments.append((normalized_audio, segment[1]))
            else:
                normalized_segments.append(normalized_audio)

        return normalized_segments

    def generate_speech(self, speech_block: SpeechBlock) -> AudioSegment:
        """
        Generate speech based on the provided SpeechBlock.

        This method determines the appropriate platform (OpenAI or ElevenLabs)
        and calls the corresponding speech generation method.

        :param speech_block: SpeechBlock containing text and id
        :return: Generated audio as AudioSegment
        :raises ValueError: If id is not found or platform is unsupported
        """

        voice = self.voices.get(speech_block.voice_id)
        if not voice:
            raise ValueError(f"Voice ID '{speech_block.voice_id}' not found")

        if voice.platform == Platform.OPENAI:
            return self._generate_openai_speech(voice, speech_block.text)
        elif voice.platform == Platform.ELEVENLABS:
            audio_data, _ = self._generate_elevenlabs_speech(voice, speech_block.text)
            return self._create_audio_segment(audio_data)
        elif voice.platform == Platform.CAMBAI:
            return self._generate_camb_speech(voice, speech_block.text)
        else:
            raise ValueError(f"Unsupported platform: {voice.platform}")

    def _generate_openai_speech(self, voice: OpenAIVoice, text: str) -> AudioSegment:
        if not self.openai_client:
            raise ValueError("OpenAI client is not initialized. Please provide a valid OpenAI API key.")

        response = openai.audio.speech.create(
            model=voice.voice_model,
            voice=voice.voice,
            input=text
        )
        return self._create_audio_segment(response.content)

    def _generate_elevenlabs_speech(self, voice: ElevenLabsVoice, text: str, previous_text: Optional[str] = None, next_text: Optional[str] = None, previous_request_ids: Optional[List[str]] = None) -> Tuple[bytes, str]:
        if not self.elevenlabs_client:
            raise ValueError("ElevenLabs client is not initialized. Please provide a valid ElevenLabs API key.")

        response = self.elevenlabs_client.generate_speech_with_conditioning(
            text=text,
            voice_id=voice.voice,
            model_id=voice.voice_model,
            previous_text=previous_text,
            next_text=next_text,
            previous_request_ids=previous_request_ids
        )

        if response.status_code != 200:
            raise ValueError(f"Error generating speech: {response.text}")

        audio_data = response.content
        request_id = response.headers.get("request-id")

        if not request_id:
            raise ValueError("No request-id found in response headers")

        return audio_data, request_id

    def _generate_camb_speech(self, voice: CambAIVoice, text: str) -> AudioSegment:
        if not self.camb_client:
            raise ValueError("CAMB AI client is not initialized. Please provide a valid CAMB API key.")

        audio_data = self.camb_client.generate_speech(
            text=text,
            voice_id=voice.voice,
            model_id=voice.voice_model,
            language=voice.language,
        )
        return self._create_audio_segment(audio_data)

    def _create_audio_segment(self, audio_data: bytes) -> AudioSegment:
        return AudioSegment.from_file(io.BytesIO(audio_data))
