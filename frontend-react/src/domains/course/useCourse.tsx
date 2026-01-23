import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import { useParams } from 'react-router-dom';
import { courseApi, type Course } from '@/api/course';

interface CourseContextValue {
    course: Course | null;
    isLoading: boolean;
    error: string | null;
}

const CourseContext = createContext<CourseContextValue | null>(null);

export function CourseProvider({ children }: { children: ReactNode }) {
    const { courseId } = useParams<{ courseId: string }>();
    const [course, setCourse] = useState<Course | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!courseId) {
            setIsLoading(false);
            return;
        }

        setIsLoading(true);
        setError(null);

        courseApi
            .get(courseId)
            .then((data) => {
                setCourse(data ?? null);
                setIsLoading(false);
            })
            .catch((err) => {
                setError(err.message);
                setIsLoading(false);
            });
    }, [courseId]);

    return (
        <CourseContext.Provider value={{ course, isLoading, error }}>
            {children}
        </CourseContext.Provider>
    );
}

export function useCourse(): CourseContextValue {
    const context = useContext(CourseContext);
    if (!context) {
        throw new Error('useCourse must be used within CourseProvider');
    }
    return context;
}
