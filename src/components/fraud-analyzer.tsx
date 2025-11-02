import { useState, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Upload, Link as LinkIcon, Loader2, FileVideo, X, ShieldAlert, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { analyzeImageForFraud } from "@/ai/flows/analyze-image-for-fraud";
import { analyzeVideoForFraud } from "@/ai/flows/analyze-video-for-fraud";
import { investigateURLForFraud } from "@/ai/flows/investigate-url-for-fraud";
import { generateFraudReport, type GenerateFraudReportOutput } from "@/ai/flows/generate-fraud-report";
import AnalysisReport from "@/components/analysis-report";
import { cn } from "@/lib/utils";
import { Alert, AlertDescription, AlertTitle } from "./ui/alert";
import Image from "next/image";
import { useI18n } from "@/components/i18n-provider";

// Cambiado para aceptar hasta 3 archivos (array)
const formSchema = z.object({
  url: z.string().url({ message: "Please enter a valid URL." }).optional().or(z.literal('')),
  mediaFiles: z
    .array(z.instanceof(File))
    .min(1, "Please upload at least one image or video to start the analysis.")
    .max(3, "You can upload up to 3 files."),
});

type FormValues = z.infer<typeof formSchema>;

const fileToDataUri = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};

export default function FraudAnalyzer() {
  const [analysisState, setAnalysisState] = useState<{
    isLoading: boolean;
    finalReport: GenerateFraudReportOutput | null;
    error: string | null;
    analyzedUrl?: string;
  }>({
    isLoading: false,
    finalReport: null,
    error: null,
  });

  // Previews para cada archivo
  const [filePreviews, setFilePreviews] = useState<string[]>([]);

  // Drag & Drop state
  const [dragActive, setDragActive] = useState(false);
  const dragCounter = useRef(0);

  const { toast } = useToast();
  const { t, language } = useI18n();

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      url: "",
      mediaFiles: [],
    },
  });

  const { control, handleSubmit, setValue, watch, formState } = form;
  const watchedFiles = watch("mediaFiles");

  // Remueve archivo individualmente
  const removeFile = (idx: number) => {
    const newFiles = watchedFiles.filter((_, i) => i !== idx);
    setValue("mediaFiles", newFiles, { shouldValidate: true });
    setFilePreviews((prev) => prev.filter((_, i) => i !== idx));
  };

  const onSubmit = async (data: FormValues) => {
    setAnalysisState({ isLoading: true, finalReport: null, error: null, analyzedUrl: data.url || undefined });

    let imageAnalysis = '';
    let urlAnalysis = '';

    try {
      const analysisTasks: Array<() => Promise<void>> = [];

      // Analiza cada archivo (imagen/video)
      if (data.mediaFiles && data.mediaFiles.length > 0) {
        analysisTasks.push(async () => {
          let allResults: string[] = [];
          for (const file of data.mediaFiles) {
            const dataUri = await fileToDataUri(file);
            if (file.type.startsWith('image/')) {
              const result = await analyzeImageForFraud({ photoDataUri: dataUri });
              allResults.push(result.analysis);
            } else if (file.type.startsWith('video/')) {
              const result = await analyzeVideoForFraud({ videoDataUri: dataUri });
              allResults.push(result.report);
            }
          }
          imageAnalysis = allResults.join("\n---\n");
        });
      }

      if (data.url) {
        analysisTasks.push(async () => {
          // INSTRUCCIÓN para la IA: no mencionar nada de registro/fecha de dominio
          const customPrompt =
            "Analyze the URL for signs of fraud. Do not mention domain registration dates or any information about when the domain was registered, created, or updated.";
          const result = await investigateURLForFraud({
            url: data.url,
            prompt: customPrompt, // <-- Cambiado aquí
          });
          // Además, por seguridad, eliminamos cualquier mención en la respuesta
          urlAnalysis = result.analysis.replace(/registered on.*|creation date.*|fecha de registro.*|registrado el.*/gi, "");
        });
      }

      await Promise.all(analysisTasks.map(run => run()));

      // En el reporte final, también filtramos cualquier mención residual
      const report = await generateFraudReport({
        imageAnalysis,
        urlAnalysis: urlAnalysis.replace(/registered on.*|creation date.*|fecha de registro.*|registrado el.*/gi, ""),
        language,
        // Opcional: puedes indicar en el prompt que no debe mencionar fechas de registro
        prompt: "Never mention domain registration dates or when the domain was created/registered in your analysis."
      });
      setAnalysisState(prev => ({ ...prev, finalReport: report }));

    } catch (e) {
      console.error(e);
      const errorMessage = e instanceof Error ? e.message : "An unknown error occurred.";
      setAnalysisState(prev => ({ ...prev, error: errorMessage }));
      toast({
        variant: "destructive",
        title: "Analysis Failed",
        description: errorMessage,
      });
    } finally {
      setAnalysisState(prev => ({ ...prev, isLoading: false }));
    }
  };

  // Procesa array de archivos, solo acepta los primeros 3, solo imagen/video
  const processFiles = (files: FileList | File[]) => {
    let validFiles: File[] = [];
    let previews: string[] = [];
    for (let i = 0; i < files.length && validFiles.length < 3; i++) {
      const file = files[i];
      if (file.type.startsWith("image/") || file.type.startsWith("video/")) {
        validFiles.push(file);
        if (file.type.startsWith("image/")) {
          previews.push(URL.createObjectURL(file));
        } else {
          previews.push(""); // No preview para video
        }
      } else {
        toast({
          variant: "destructive",
          title: "Invalid File Type",
          description: "Please upload an image or video file.",
        });
      }
    }
    if (files.length > 3) {
      toast({
        variant: "destructive",
        title: "Maximum 3 files allowed",
        description: "Please remove extra files.",
      });
    }
    setValue("mediaFiles", validFiles, { shouldValidate: true });
    setFilePreviews(previews);
  };

  // Para input file
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    processFiles(e.target.files);
  };

  // Drag & Drop handlers
  const onDragEnter = (e: React.DragEvent<HTMLElement>) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current += 1;
    setDragActive(true);
  };
  const onDragOver = (e: React.DragEvent<HTMLElement>) => {
    e.preventDefault();
    e.stopPropagation();
  };
  const onDragLeave = (e: React.DragEvent<HTMLElement>) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current -= 1;
    if (dragCounter.current <= 0) {
      dragCounter.current = 0;
      setDragActive(false);
    }
  };
  const onDrop = (e: React.DragEvent<HTMLElement>) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current = 0;
    setDragActive(false);
    if (e.dataTransfer.files) processFiles(e.dataTransfer.files);
  };

  return (
    <Card className="overflow-hidden">
      <CardHeader>
        <CardTitle className="font-headline flex items-center gap-2">
          <ShieldAlert className="h-6 w-6 text-primary" />
          {t('Start New Analysis')}
        </CardTitle>
        <CardDescription>
          {t('Provide a URL, and/or upload an image/video of a crypto broker or ad. Our AI will analyze them for signs of fraud.')}
        </CardDescription>
      </CardHeader>
      <Form {...form}>
        <form onSubmit={handleSubmit(onSubmit)}>
          <CardContent className="space-y-6">
            <FormField
              control={control}
              name="url"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="font-bold">Broker or Promotion URL</FormLabel>
                  <div className="relative">
                    <LinkIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                    <FormControl>
                      <Input placeholder="https://example.com" className="pl-10" {...field} />
                    </FormControl>
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={control}
              name="mediaFiles"
              render={() => (
                <FormItem>
                  <FormLabel className="font-bold">Image or Video Upload (max 3)</FormLabel>
                  <FormControl>
                    <div className="relative">
                      <input
                        id="file-upload"
                        type="file"
                        className="hidden"
                        onChange={handleFileChange}
                        multiple
                        accept="image/*,video/*"
                      />
                      <label
                        htmlFor="file-upload"
                        onDragEnter={onDragEnter}
                        onDragOver={onDragOver}
                        onDragLeave={onDragLeave}
                        onDrop={onDrop}
                        className={cn(
                          "flex flex-col items-center justify-center w-full h-48 border-2 border-dashed rounded-lg cursor-pointer hover:bg-card",
                          "border-border text-muted-foreground transition-colors",
                          dragActive && "border-primary bg-primary/5"
                        )}
                      >
                        <div className="flex flex-col items-center justify-center pt-5 pb-6">
                          <Upload className="w-10 h-10 mb-3" />
                          <p className="mb-2 text-sm">
                            <span className="font-semibold">Click to upload</span> or drag and drop (up to 3 files)
                          </p>
                          <p className="text-xs">Images or Videos (PNG, JPG, MP4, etc.)</p>
                        </div>
                      </label>
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Previews y eliminar archivos */}
            {watchedFiles && watchedFiles.length > 0 && (
              <div className="mt-4 flex gap-4 flex-wrap justify-center">
                {watchedFiles.map((file, idx) => (
                  <div
                    key={idx}
                    className="relative w-fit mx-auto p-2 border rounded-lg bg-muted/50"
                  >
                    {filePreviews[idx] ? (
                      <Image
                        src={filePreviews[idx]}
                        alt="Preview"
                        width={120}
                        height={120}
                        className="max-h-32 w-auto rounded-md"
                      />
                    ) : (
                      <FileVideo className="h-12 w-12 text-muted-foreground" />
                    )}
                    <div className="text-sm mt-2 text-center truncate max-w-xs">
                      {file.name}
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute -top-3 -right-3 h-7 w-7 bg-card rounded-full"
                      onClick={() => removeFile(idx)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}

            {formState.errors.mediaFiles && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{formState.errors.mediaFiles.message}</AlertDescription>
              </Alert>
            )}
          </CardContent>

          <CardFooter>
            <Button
              type="submit"
              disabled={analysisState.isLoading}
              className="w-full bg-accent hover:bg-accent/90 text-accent-foreground font-bold"
            >
              {analysisState.isLoading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <ShieldAlert className="mr-2 h-4 w-4" />
              )}
              {t('Analyze for Fraud')}
            </Button>
          </CardFooter>
        </form>
      </Form>

      {analysisState.isLoading && (
        <div className="p-6 border-t flex flex-col items-center justify-center gap-4 min-h-[200px]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-lg font-semibold text-foreground">AI Analysis in Progress...</p>
          <p className="text-sm text-muted-foreground text-center">
            This may take a moment. Please don't close this page.
          </p>
        </div>
      )}

      {analysisState.error && !analysisState.isLoading && (
        <div className="p-6 border-t">
          <Alert variant="destructive">
            <ShieldAlert className="h-4 w-4" />
            <AlertTitle>Error During Analysis</AlertTitle>
            <AlertDescription>{analysisState.error}</AlertDescription>
          </Alert>
        </div>
      )}

      {analysisState.finalReport && !analysisState.isLoading && (
        <div className="p-6 border-t bg-background/50">
          <AnalysisReport
            report={analysisState.finalReport.report}
            confidenceScore={analysisState.finalReport.confidenceScore}
            analyzedUrl={analysisState.analyzedUrl}
          />
        </div>
      )}
    </Card>
  );
}
