import React, { useState, useCallback, useMemo } from 'react';
import { Image, Wand, Loader2, Maximize2, Download, Upload, Trash2, Plus } from 'lucide-react';

// Configuration for the Image API model and endpoint
const MODEL_NAME = 'gemini-2.5-flash-image-preview';
// The API key is handled automatically by the environment if left as an empty string.
const apiKey = "";
const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_NAME}:generateContent?key=${apiKey}`;

// Maximum file size per image (30MB)
const MAX_FILE_SIZE_BYTES = 30 * 1024 * 1024;

/**
 * Image Generation Component (Text-to-Image / Image-to-Image)
 * Uses the Gemini API to create or modify images based on user prompts and multiple optional image inputs.
 */
const App = () => {
    const [prompt, setPrompt] = useState('Combine these images into a surreal collage, adding a touch of neon glow.');
    const [aspectRatio, setAspectRatio] = useState('1:1');
    const [generatedImage, setGeneratedImage] = useState(null);
    // State to hold multiple uploaded images: Array of { id: string, dataUrl: string, mimeType: string, name: string }
    const [uploadedImages, setUploadedImages] = useState([]); 
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);

    // Aspect Ratio options for the user interface
    const ratioOptions = useMemo(() => [
        { label: 'Square (1:1)', value: '1:1', widthClass: 'w-4 h-4' },
        { label: 'Landscape (16:9)', value: '16:9', widthClass: 'w-8 h-4' },
        { label: 'Portrait (3:4)', value: '3:4', widthClass: 'w-4 h-6' },
    ], []);

    // --- Image Upload Handling ---

    const handleImageUpload = (event) => {
        const files = Array.from(event.target.files);
        if (files.length === 0) return;

        setError(null);

        files.forEach(file => {
            if (file.size > MAX_FILE_SIZE_BYTES) {
                setError(`File "${file.name}" exceeds the 30MB limit and was skipped.`);
                return;
            }

            const reader = new FileReader();
            reader.onloadend = () => {
                const dataUrl = reader.result; // data:image/jpeg;base64,...
                const [metadata] = dataUrl.split(',');
                // Ensure we get a proper mimeType, defaulting to jpeg if necessary
                const mimeTypeMatch = metadata.match(/:(.*?);/);
                const mimeType = mimeTypeMatch ? mimeTypeMatch[1] : file.type || 'image/jpeg';
                
                const newImage = {
                    id: crypto.randomUUID(), // Unique ID for key/removal
                    dataUrl: dataUrl,
                    mimeType: mimeType,
                    name: file.name
                };

                setUploadedImages(prevImages => [...prevImages, newImage]);
            };

            reader.onerror = () => {
                setError(`Failed to read file: ${file.name}.`);
            };

            reader.readAsDataURL(file);
        });

        // Clear file input value to allow re-uploading the same file
        event.target.value = '';
    };

    const removeUploadedImage = (id) => {
        setUploadedImages(prevImages => prevImages.filter(img => img.id !== id));
    };
    
    // NEW FUNCTION: Clears all uploaded images
    const clearAllImages = useCallback(() => {
        setUploadedImages([]);
    }, []);

    // Function to trigger the hidden file input (for the "plus button")
    const triggerFileInput = () => {
        document.getElementById('image-upload-multiple')?.click();
    };

    // --- API Logic ---

    // Exponential backoff retry mechanism for API calls
    const fetchWithRetry = useCallback(async (url, options, maxRetries = 5) => {
        let lastError = null;
        for (let i = 0; i < maxRetries; i++) {
            try {
                const response = await fetch(url, options);
                if (!response.ok) {
                    const errorText = await response.text();
                    throw new Error(`API call failed with status ${response.status}: ${errorText}`);
                }
                return response.json();
            } catch (error) {
                lastError = error;
                const delay = Math.pow(2, i) * 1000 + Math.random() * 1000;
                if (i < maxRetries - 1) {
                    await new Promise(resolve => setTimeout(resolve, delay));
                }
            }
        }
        throw lastError;
    }, []);

    const generateImage = useCallback(async (e) => {
        e.preventDefault();
        
        // At least a prompt or an image is required
        if (!prompt.trim() && uploadedImages.length === 0) {
            setError('Please enter a descriptive prompt or upload at least one image.');
            return;
        }

        setIsLoading(true);
        setError(null);
        setGeneratedImage(null);

        // Construct the parts array: first the text prompt
        const parts = [{ text: prompt }];

        // Then, add all uploaded images to the parts array
        uploadedImages.forEach(img => {
            // The dataUrl is "data:image/mimeType;base64,BASE64_DATA", we need the part after the comma
            const base64Data = img.dataUrl.split(',')[1]; 

            parts.push({
                inlineData: {
                    mimeType: img.mimeType,
                    data: base64Data
                }
            });
        });

        const payload = {
            contents: [{ role: "user", parts: parts }],
            generationConfig: {
                responseModalities: ['TEXT', 'IMAGE']
            },
        };

        try {
            const options = {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            };

            const result = await fetchWithRetry(apiUrl, options);

            const base64Part = result?.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
            const base64Data = base64Part?.inlineData?.data;

            if (base64Data) {
                const outputMimeType = base64Part?.inlineData?.mimeType || 'image/png';
                const imageUrl = `data:${outputMimeType};base64,${base64Data}`;
                setGeneratedImage(imageUrl);
            } else {
                setError('Image generation failed: No image data received.');
            }

        } catch (err) {
            console.error("Image Generation Error:", err);
            setError(`Failed to generate image. Please try a different prompt and/or image(s). Error: ${err.message}`);
        } finally {
            setIsLoading(false);
        }
    }, [prompt, uploadedImages, fetchWithRetry]);

    const handleDownload = () => {
        if (generatedImage) {
            const link = document.createElement('a');
            link.href = generatedImage;
            link.download = uploadedImages.length > 0 ? 'ai-edited-image.png' : 'ai-generated-image.png';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        }
    };

    // --- UI Components ---

    const LoadingState = () => (
        <div className="flex flex-col items-center justify-center p-8 bg-gray-100/50 rounded-xl shadow-inner animate-pulse">
            <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
            <p className="mt-4 text-sm font-medium text-indigo-600">
                Processing images... this may take a moment.
            </p>
            <p className="mt-2 text-xs text-gray-500">
                Combining {uploadedImages.length} image(s) with your prompt.
            </p>
        </div>
    );

    const ImageDisplay = () => (
        <div className="relative w-full h-full bg-gray-50 rounded-xl overflow-hidden shadow-2xl transition-all duration-300 transform hover:scale-[1.01]">
            {generatedImage ? (
                // Image container
                <div className="group relative w-full h-full">
                    <img
                        src={generatedImage}
                        alt="AI Generated Art"
                        className="object-contain w-full h-full"
                        onError={() => setError("Failed to load generated image.")}
                    />
                    {/* Floating Download Button */}
                    <button
                        onClick={handleDownload}
                        className="absolute bottom-4 right-4 bg-indigo-600 p-3 rounded-full text-white shadow-xl flex items-center gap-2 
                                   opacity-90 hover:opacity-100 transition-all duration-300 hover:scale-105 z-10"
                        title="Download Image"
                    >
                        <Download className="w-5 h-5" />
                        <span className="hidden sm:inline font-semibold text-sm">Download</span>
                    </button>
                    {/* Hover Overlay for better aesthetics */}
                    <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-20 transition-all duration-300 flex items-center justify-center pointer-events-none">
                        <Maximize2 className="w-8 h-8 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                </div>
            ) : (
                // Placeholder before generation
                <div className="flex flex-col items-center justify-center h-full text-center p-8 text-gray-400">
                    <Wand className="w-12 h-12 mb-4" />
                    <p className="text-lg font-semibold">
                        Enter a prompt and optionally upload images to start.
                    </p>
                    <p className="text-sm mt-2">
                        Upload multiple images for powerful visual mixing and editing (Image-to-Image).
                    </p>
                </div>
            )}
        </div>
    );

    return (
        <div className="min-h-screen bg-gray-50 p-4 sm:p-8 font-sans flex items-center justify-center">
            <div className="w-full max-w-6xl bg-white p-6 sm:p-10 rounded-3xl shadow-2xl ring-4 ring-indigo-100/50">
                {/* Header */}
                <div className="mb-8 text-center">
                    <h1 className="text-4xl font-extrabold text-gray-900 flex items-center justify-center gap-3">
                        <Image className="w-8 h-8 text-indigo-600" />
                        AI Image Generator & Editor
                    </h1>
                    <p className="mt-2 text-gray-500 text-lg">
                        Upload up to 16 images for visual context, powered by the Gemini API.
                    </p>
                </div>

                {/* Main Layout: Controls and Output */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">

                    {/* Control Panel (Left/Top) */}
                    <form onSubmit={generateImage} className="lg:col-span-1 space-y-6">

                        {/* Prompt Input */}
                        <div className="space-y-2">
                            <label htmlFor="prompt" className="text-sm font-semibold text-gray-700">
                                Prompt (The creative instruction)
                            </label>
                            <textarea
                                id="prompt"
                                rows="4"
                                className="w-full p-3 border border-gray-300 rounded-xl shadow-inner focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 resize-none transition duration-150"
                                value={prompt}
                                onChange={(e) => setPrompt(e.target.value)}
                                placeholder="Describe the image you want to create or how to modify the uploaded images..."
                                disabled={isLoading}
                            />
                        </div>

                        {/* Image Upload Input */}
                        <div className="space-y-3">
                            <label className="text-sm font-semibold text-gray-700 block">
                                Uploaded Images ({uploadedImages.length})
                            </label>

                            {/* List of Uploaded Images */}
                            {uploadedImages.length > 0 && (
                                <div className="p-3 bg-gray-100 rounded-xl border border-gray-200">
                                    <div className="flex flex-wrap gap-3 max-h-40 overflow-y-auto pr-2">
                                        {uploadedImages.map((img) => (
                                            <div key={img.id} className="relative group w-16 h-16 rounded-lg overflow-hidden shadow-md">
                                                <img 
                                                    src={img.dataUrl} 
                                                    alt={img.name} 
                                                    className="w-full h-full object-cover" 
                                                />
                                                <button
                                                    type="button"
                                                    onClick={() => removeUploadedImage(img.id)}
                                                    className="absolute inset-0 flex items-center justify-center bg-red-600 bg-opacity-70 text-white opacity-0 group-hover:opacity-100 transition-opacity duration-200"
                                                    title={`Remove ${img.name}`}
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                    <button
                                        type="button"
                                        onClick={clearAllImages} // Now calls the defined function
                                        className="mt-2 w-full text-center text-xs text-red-600 hover:text-red-700 font-medium transition duration-150"
                                    >
                                        Clear All Images
                                    </button>
                                </div>
                            )}

                            {/* "Add Image" Button (Plus button) */}
                            <button
                                type="button"
                                onClick={triggerFileInput}
                                disabled={isLoading}
                                className="w-full flex items-center justify-center py-3 px-4 rounded-xl border-2 border-dashed border-indigo-400 text-indigo-600 hover:border-indigo-600 hover:bg-indigo-50 transition duration-150"
                            >
                                <Plus className="w-5 h-5 mr-2" />
                                Add Image (Max 30MB per file)
                            </button>
                            
                            {/* Hidden File Input */}
                            <input
                                id="image-upload-multiple"
                                type="file"
                                accept="image/jpeg, image/png"
                                multiple
                                onChange={handleImageUpload}
                                className="hidden"
                                disabled={isLoading}
                            />
                        </div>

                        {/* Aspect Ratio Selection (Less relevant for editing, but kept for new image generation) */}
                        <div className="space-y-2">
                            <label className="text-sm font-semibold text-gray-700 block">
                                Aspect Ratio (Mostly ignored with multiple image inputs)
                            </label>
                            <div className="flex gap-4">
                                {ratioOptions.map((option) => (
                                    <button
                                        key={option.value}
                                        type="button"
                                        onClick={() => setAspectRatio(option.value)}
                                        disabled={isLoading}
                                        className={`flex items-center justify-center p-3 rounded-xl border-2 transition-all duration-200 ${
                                            aspectRatio === option.value
                                                ? 'bg-indigo-600 text-white border-indigo-600 shadow-md transform scale-105'
                                                : 'bg-white text-gray-700 border-gray-300 hover:border-indigo-400 disabled:opacity-50'
                                        }`}
                                    >
                                        <div className={`border border-white/50 ${option.widthClass} mr-2 rounded-[2px]`} />
                                        <span className="text-sm font-medium">{option.label}</span>
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Error Message */}
                        {error && (
                            <div className="p-3 text-sm font-medium text-red-700 bg-red-100 border border-red-300 rounded-xl">
                                {error}
                            </div>
                        )}

                        {/* Generate Button */}
                        <button
                            type="submit"
                            disabled={isLoading}
                            className={`w-full flex items-center justify-center py-3 px-4 rounded-xl text-lg font-bold text-white transition duration-300 shadow-lg ${
                                isLoading
                                    ? 'bg-indigo-400 cursor-not-allowed'
                                    : 'bg-indigo-600 hover:bg-indigo-700 hover:shadow-xl active:bg-indigo-800'
                            }`}
                        >
                            {isLoading ? (
                                <>
                                    <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                                    Generating...
                                </>
                            ) : (
                                <>
                                    <Wand className="w-5 h-5 mr-2" />
                                    {uploadedImages.length > 0 ? `Edit/Combine ${uploadedImages.length} Image(s)` : 'Generate Image'}
                                </>
                            )}
                        </button>
                    </form>

                    {/* Image Output Area (Right/Bottom) */}
                    <div className="lg:col-span-2 min-h-[350px] relative">
                        <div className="w-full h-full aspect-square md:aspect-[unset] flex items-center justify-center">
                            {isLoading ? <LoadingState /> : <ImageDisplay />}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default App;
